import humanizeDuration from 'humanize-duration';
import { EsInterfaceService, VirtualCollectionsIndexerService, VirtualCollectionsRegistryService, VirtualCollectionConfig } from '../types';
import { HelperService } from '../types/helper-service.type';

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
        const results = await collection.extractById([itemId]);

        if (!results || !Array.isArray(results) || results.length === 0) {
          strapi.log.warn(`No data extracted for ${collectionName} with ID ${itemId}`);
          return null;
        }

        const itemData = results[0];

        const esInterface = getElasticsearchService();
        const helper = getHelperService();
        const indexItemId = helper.getIndexItemId({ collectionName, itemId });
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
    async reindex<T extends { id: number }>(collection: VirtualCollectionConfig<T>) {
      const collectionName = collection.collectionName;
      const privateIndexAlias: string | undefined = collection.indexAlias;

      const helper = getHelperService();

      let timestamp = Date.now();
      try {
        const esInterface = getElasticsearchService();

        let indexName: string;
        if (privateIndexAlias) {
          indexName = await helper.getIncrementedIndexName(privateIndexAlias);
          await esInterface.createIndex(indexName, collection.mappings);
        } else {
          indexName = await helper.getCurrentIndexName();
        }

        let page = 0;
        let hasMoreData = true;
        let totalIndexed = 0;

        while (hasMoreData) {
          const pageData = await collection.extractData(page);

          if (!Array.isArray(pageData) || pageData.length === 0) {
            hasMoreData = false;
            break;
          }

          const operations: { itemId: string; itemData: any }[] = [];
          for (const itemData of pageData) {
            const itemId = helper.getIndexItemId({ collectionName, itemId: itemData.id });
            operations.push({ itemId, itemData });
          }

          if (operations.length > 0) {
            await Promise.all(operations.map((op) => esInterface.indexDataToSpecificIndex(op, indexName)));
          }

          totalIndexed += pageData.length;
          page++;
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
        strapi.log.error(`Error reindexing ${collectionName}: ${error?.message} after ${humanizeDuration(Date.now() - timestamp)}`);
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
      const affectedCollections = registry.findTriggersByCollection(model);

      for (const collection of affectedCollections) {
        // Find the specific trigger for this collection
        const trigger = collection.triggers.find((t) => t.collection === model);

        if (trigger && trigger.getIdsToReindex) {
          // Get IDs that need to be reindexed
          const idsToReindex = await trigger.getIdsToReindex(result);

          // Reindex each item
          for (const id of idsToReindex) {
            await this.indexItem(collection.collectionName, id);
          }
        }
      }
    },

    /**
     * Delete an item from a virtual collection index
     */
    async deleteItem(collectionName, itemId) {
      const registry = getRegistryService();
      const collection = registry.get(collectionName);

      if (!collection) {
        throw new Error(`Virtual collection not found: ${collectionName}`);
      }

      try {
        const esInterface = getElasticsearchService();
        await esInterface.removeItemFromIndex({ itemId });

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
