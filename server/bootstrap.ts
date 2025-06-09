'use strict';

import { get } from 'http';
import { EsAuth, EsInterfaceService } from './types';
import { HelperService } from './types/helper-service.type';
import { VirtualCollectionsIndexerService, VirtualCollectionsRegistryService } from './types/virtual-collections.type';

export default async ({ strapi }) => {
  const pluginConfig = await strapi.config.get('plugin.elasticsearch');
  const configureIndexingService = strapi.plugins['elasticsearch'].services.configureIndexing;
  const scheduleIndexingService = strapi.plugins['elasticsearch'].services.scheduleIndexing;
  const esInterface: EsInterfaceService = strapi.plugins['elasticsearch'].services.esInterface;
  const indexer = strapi.plugins['elasticsearch'].services.indexer;
  const helper: HelperService = strapi.plugins['elasticsearch'].services.helper;
  const virtualCollectionIndexer: VirtualCollectionsIndexerService = strapi.plugins['elasticsearch'].services.virtualCollectionsIndexer;

  try {
    await configureIndexingService.initializeStrapiElasticsearch();

    if (!Object.keys(pluginConfig).includes('indexingCronSchedule'))
      console.warn('The plugin strapi-plugin-elasticsearch is enabled but the indexingCronSchedule is not configured.');
    if (!Object.keys(pluginConfig).includes('searchConnector')) console.warn('The plugin strapi-plugin-elasticsearch is enabled but the searchConnector is not configured.');
    else {
      const connector = pluginConfig['searchConnector'];
      const auth = getAuth(connector);
      await esInterface.initializeSearchEngine({
        host: connector.host,
        auth,
        cert: connector.certificate,
      });
      strapi.cron.add({
        elasticsearchIndexing: {
          task: async ({ strapi }) => {
            try {
              await indexer.indexPendingData();
            } catch (err) {
              strapi.log.error('Error while indexing data: ', err);
            }
          },
          options: {
            rule: pluginConfig['indexingCronSchedule'],
          },
        },
      });

      if (await esInterface.checkESConnection()) {
        //Attach the alias to the current index:
        const idxName = await helper.getCurrentIndexName();
        await esInterface.attachAliasToIndex(idxName);
      }
    }

    strapi.db.lifecycles.subscribe(async (event) => {
      if (event.action === 'afterCreate' || event.action === 'afterUpdate') {
        if (strapi.elasticsearch.collections.includes(event.model.uid)) {
          //collection without draft-publish
          if (typeof event.model.attributes.publishedAt === 'undefined') {
            await scheduleIndexingService.addItemToIndex({
              collectionUid: event.model.uid,
              recordId: event.result.id,
            });
          } else if (event.model.attributes.publishedAt) {
            if (event.result.publishedAt) {
              await scheduleIndexingService.addItemToIndex({
                collectionUid: event.model.uid,
                recordId: event.result.id,
              });
            } else {
              //unpublish
              await scheduleIndexingService.removeItemFromIndex({
                collectionUid: event.model.uid,
                recordId: event.result.id,
              });
            }
          }
        }
      }
      //bulk publish-unpublish from list view
      if (event.action === 'afterCreateMany' || event.action === 'afterUpdateMany') {
        if (strapi.elasticsearch.collections.includes(event.model.uid)) {
          if (Object.keys(event.params.where.id).includes('$in')) {
            const updatedItemIds = event.params.where.id['$in'];
            //bulk unpublish
            if (typeof event.params.data.publishedAt === 'undefined' || event.params.data.publishedAt === null) {
              for (let k = 0; k < updatedItemIds.length; k++) {
                await scheduleIndexingService.removeItemFromIndex({
                  collectionUid: event.model.uid,
                  recordId: updatedItemIds[k],
                });
              }
            } else {
              for (let k = 0; k < updatedItemIds.length; k++) {
                await scheduleIndexingService.addItemToIndex({
                  collectionUid: event.model.uid,
                  recordId: updatedItemIds[k],
                });
              }
            }
          }
        }
      }
      if (event.action === 'afterDelete') {
        if (strapi.elasticsearch.collections.includes(event.model.uid)) {
          await scheduleIndexingService.removeItemFromIndex({
            collectionUid: event.model.uid,
            recordId: event.result.id,
          });
        }
      }
      if (event.action === 'afterDeleteMany') {
        if (strapi.elasticsearch.collections.includes(event.model.uid)) {
          if (
            Object.keys(event.params.where).includes('$and') &&
            Array.isArray(event.params.where['$and']) &&
            Object.keys(event.params.where['$and'][0]).includes('id') &&
            Object.keys(event.params.where['$and'][0]['id']).includes('$in')
          ) {
            const deletedItemIds = event.params.where['$and'][0]['id']['$in'];
            for (let k = 0; k < deletedItemIds.length; k++) {
              await scheduleIndexingService.removeItemFromIndex({
                collectionUid: event.model.uid,
                recordId: deletedItemIds[k],
              });
            }
          }
        }
      }
    });

    // Register virtual collections //

    const registry: VirtualCollectionsRegistryService = strapi.service('plugin::elasticsearch.virtualCollectionsRegistry');

    // Setup lifecycle hooks
    const virtualCollections = registry.getAll();

    // Check if indices exists, if not create them
    virtualCollections.forEach(async (collection) => {
      const indexName = await helper.getCurrentIndexName(collection.indexAlias);
      const indexExists = await esInterface.listIndicesByPattern(indexName);
      if (!indexExists.includes(indexName)) {
        await esInterface.createIndex(indexName, collection.mappings);
        strapi.log.info(`Created Elasticsearch index: ${indexName}`);
      }
    });

    // Create a set of all collections that need hooks
    const collectionsToHook = new Set();

    virtualCollections.forEach((collection) => {
      collection.triggers.forEach((trigger) => {
        collectionsToHook.add(trigger.collection);
      });
    });

    // Setup hooks for each collection
    collectionsToHook.forEach((collectionUID) => {
      strapi.log.info(`Setting up Elasticsearch lifecycle hooks for collection: ${collectionUID}`);

      strapi.db.lifecycles.subscribe({
        models: [collectionUID],

        afterCreate: async (event) => {
          await virtualCollectionIndexer.handleTriggerEvent(event);
        },

        afterUpdate: async (event) => {
          await virtualCollectionIndexer.handleTriggerEvent(event);
        },

        afterDelete: async (event) => {
          await virtualCollectionIndexer.handleTriggerEvent(event);
        },
      });
    });

    // clean up old indexing tasks, as server is booting.
    // allow 60 seconds, in case strapi is being run in cluster mode and this is the second instance
    await scheduleIndexingService.getActiveFullIndexingTasks(60);

    configureIndexingService.markInitialized();
  } catch (err: any) {
    console.error('An error was encountered while initializing the strapi-plugin-elasticsearch plugin.');
    if (err.name == 'ValidationError') {
      throw err; // fail strapi startup if the config is invalid
    }
    console.error(err);
  }
};

function getAuth(connector: any): EsAuth | undefined {
  const { apiKey, username, password, bearer } = connector;
  let auth: EsAuth | undefined;
  let configTypes: string[] = [];

  if (username && password) {
    auth = { username, password };
    configTypes.push('username/password');
  }
  if (bearer) {
    auth = { bearer };
    configTypes.push('bearer');
  }
  if (apiKey) {
    auth = { apiKey };
    configTypes.push('apiKey');
  }

  if (configTypes.length > 1) {
    throw new Error('You cannot provide more than one authentication method. Please choose one of the following: ' + configTypes.join(', '));
  }

  if (!auth) {
    throw new Error('No authentication method provided. Please provide one of the following: apiKey, bearer, username+password');
  }
  return auth!;
}
