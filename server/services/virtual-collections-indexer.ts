import humanizeDuration from 'humanize-duration';
import { EsInterfaceService, VirtualCollectionsIndexerService, VirtualCollectionsRegistryService, VirtualCollectionConfig, StrapiEntity } from '../types';
import { HelperService } from '../types/helper-service.type';
import { errors } from '@elastic/elasticsearch';

/**
 * Service to handle indexing of virtual collections
 */
export default ({ strapi }): VirtualCollectionsIndexerService => {
  const getElasticsearchService = (): EsInterfaceService => strapi.plugin('elasticsearch').service('esInterface');
  const getRegistryService = (): VirtualCollectionsRegistryService => strapi.service('plugin::elasticsearch.virtualCollectionsRegistry');
  const getHelperService: () => HelperService = () => strapi.plugins['elasticsearch'].services.helper;

  return {
    /**
     * Index a single item from a virtual collection
     */
    async indexItem(collectionName, itemId) {
      const registry = getRegistryService();
      const collection = registry.get(collectionName);

      if (!collection) {
        throw new Error(`Virtual collection not found: ${collectionName}`);
      }

      try {
        const results = await collection.extractByIds([itemId]);

        if (!results || !Array.isArray(results) || results.length === 0) {
          // item does not exit - delete it from index
          await this.deleteItem(collectionName, itemId);
          strapi.log.debug(`Deleted virtual item: ${collectionName}:${itemId}`);
          return null;
        }

        const itemData = results[0];

        const esInterface = getElasticsearchService();
        const helper = getHelperService();
        const indexItemId = collection.getIndexItemId!(itemId, collectionName);
        const indexName = await helper.getCurrentIndexName(collection.indexAlias);
        await esInterface.indexDataToSpecificIndex({ itemId: indexItemId, itemData }, indexName);

        strapi.log.debug(`Indexed virtual item: ${collectionName}:${itemId}`);
        return itemData;
      } catch (error: any) {
        strapi.log.error(`Error indexing ${collectionName}:${itemId}: ${error?.message}`);
        throw error;
      }
    },

    async reindexAll() {
      const timestamp = Date.now();
      const registry = getRegistryService();
      const collections = registry.getAll();

      let totalIndexed = 0;
      for (const collection of collections) {
        totalIndexed += await this.reindex(collection);
      }

      strapi.log.info(
        `strapi-plugin-elasticsearch : Reindexed ${totalIndexed} items across all ${collections.length} virtual collections. took ${humanizeDuration(Date.now() - timestamp)} `
      );
      return totalIndexed;
    },

    /**
     * Reindex all items in a virtual collection
     */
    async reindex(collection: VirtualCollectionConfig) {
      const collectionName = collection.collectionName;
      const privateIndexAlias: string | undefined = collection.indexAlias;
      const pageSize = 100;

      const helper = getHelperService();

      let timestamp = Date.now();
      let indexName = '';
      let errors = 0;
      try {
        const esInterface = getElasticsearchService();

        if (privateIndexAlias) {
          indexName = await helper.getIncrementedIndexName(privateIndexAlias);
          await esInterface.createIndex(indexName, collection.mappings);
        } else {
          indexName = await helper.getCurrentIndexName();
        }

        let page = 0;
        let prevPageData: StrapiEntity[] = [];
        let totalIndexed = 0;

        const pageLimit = 10000;
        while (page <= pageLimit) {
          let pageData: StrapiEntity[];
          try {
            pageData = await collection.extractData(page, pageSize);
          } catch (error: Error | any) {
            strapi.log.error(`Error extracting data for page ${page} of ${collectionName}: ${error.message}`);
            errors += pageSize;
            page++;
            continue;
          }
          strapi.log.debug(`Extracted ${pageData.length} items from ${collectionName} for page ${page}`);

          if (!Array.isArray(pageData) || pageData.length === 0) {
            break;
          }
          if (JSON.stringify(prevPageData) == JSON.stringify(pageData)) {
            throw new Error(`Infinite loop detected at page ${page} while reindexing ${collectionName}. Stopping reindexing. Check this virtual-collection's extractData().
  current page 1st item (id ${pageData[0]?.id}):
  ${JSON.stringify(pageData[0])}
  prev page 1st item (id ${prevPageData[0]?.id}):
  ${JSON.stringify(prevPageData[0])}`);
          }
          if (page >= pageLimit) {
            strapi.log.warn(`Page ${page} of ${collectionName} is greater than page-limit (${pageLimit}). stopping indexing this virtual-collection.`);
            pageData.length = pageLimit;
          }

          const operations: { itemId: string; itemData: any }[] = [];
          for (const itemData of pageData) {
            const itemId = collection.getIndexItemId!(itemData.id, collectionName);
            operations.push({ itemId, itemData });
          }

          if (operations.length > 0) {
            await Promise.all(
              operations.map((op) =>
                esInterface.indexDataToSpecificIndex(op, indexName).catch((err) => {
                  strapi.log.error(`Failed to index item ${op.itemId} in ${collectionName}: ${err}`);
                  errors++;
                })
              )
            );
          }

          totalIndexed += pageData.length;
          prevPageData = pageData;
          page++;
        }

        if (errors > 0) {
          throw new Error(
            `Failed to index ${errors} of ${totalIndexed} items for virtual collection ${collectionName}. Errors were logged. Alias was not updated. took ${humanizeDuration(Date.now() - timestamp)}`
          );
        }

        strapi.log.info(`Reindexed ${totalIndexed} items for virtual collection: ${collectionName}. took ${humanizeDuration(Date.now() - timestamp)}. now updating alias.`);

        if (privateIndexAlias) {
          timestamp = Date.now();
          await esInterface.attachAliasToIndex(indexName, privateIndexAlias, collection.mappings);
          strapi.log.info(`Done attachAliasToIndex alias ${privateIndexAlias} to index ${indexName}. took ${humanizeDuration(Date.now() - timestamp)}`);

          timestamp = Date.now();
          const oldIndicesDeleted = await helper.deleteOldIndices(privateIndexAlias);
          strapi.log.info(`Done deleting ${oldIndicesDeleted.length} old indices: ${oldIndicesDeleted}. took ${humanizeDuration(Date.now() - timestamp)}`);
        }

        return totalIndexed;
      } catch (error: any) {
        strapi.log.error(`Error reindexing ${collectionName} to index ${indexName}: ${error?.message} after ${humanizeDuration(Date.now() - timestamp)}`);
        throw error;
      }
    },

    /**
     * Handle a trigger event from a collection
     */
    async handleTriggerEvent(event) {
      const { model, result } = event;
      const registry = getRegistryService();

      // Find virtual collections that should be triggered by this model
      const affectedCollections = registry.findTriggersByCollection(model.uid);

      for (const collection of affectedCollections) {
        // Find the specific trigger for this collection
        const trigger = collection.triggers.find((t) => t.collection === model.uid);

        if (trigger?.getIdsToReindex == null) {
          strapi.log.error(`Trigger for ${collection.collectionName} (triggered by ${model.uid}) does not have getIdsToReindex function.`);
          return;
        }

        // Get IDs that need to be reindexed
        const idsToReindex = await trigger.getIdsToReindex(result);

        // Reindex each item
        for (const id of idsToReindex) {
          await this.indexItem(collection.collectionName, id);
        }
      }
    },

    /**
     * Delete an item from a virtual collection index
     */
    async deleteItem(collectionName, itemId) {
      const registry = getRegistryService();
      const helper = getHelperService();
      const collection = registry.get(collectionName);

      if (!collection) {
        throw new Error(`Virtual collection not found: ${collectionName}`);
      }

      try {
        const esInterface = getElasticsearchService();
        const indexItemId = collection.getIndexItemId!(itemId, collectionName);
        const indexName = collection.indexAlias || (await helper.getCurrentIndexName());
        await esInterface.removeItemFromIndex({ indexName, itemId: indexItemId });

        strapi.log.debug(`Deleted indexed item: ${collectionName}:${itemId}`);
        return true;
      } catch (error: any) {
        if (error?.meta?.statusCode === 404) {
          return false;
        }
        strapi.log.error(`Error deleting ${collectionName}:${itemId}: ${error.message}`);
        throw error;
      }
    },
  };
};
