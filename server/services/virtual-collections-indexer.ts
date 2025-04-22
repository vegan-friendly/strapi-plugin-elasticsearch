import { EsInterfaceService, VirtualCollectionsRegistryService } from '../types';

/**
 * Service to handle indexing of virtual collections
 */
export default ({ strapi }) => {
  const getElasticsearchService = (): EsInterfaceService => strapi.plugin('elasticsearch').service('esInterface');
  const getRegistryService = (): VirtualCollectionsRegistryService => strapi.service('plugin::elasticsearch.virtualCollectionsRegistry');

  return {
    /**
     * Initialize indexes for all registered virtual collections
     */
    async initializeIndexes() {
      const registry = getRegistryService();
      const collections = registry.getAll();

      for (const collection of collections) {
        await this.createIndexIfNotExists(collection.indexName);
      }
    },

    /**
     * Create an Elasticsearch index if it doesn't exist
     */
    async createIndexIfNotExists(indexName) {
      const esService = getElasticsearchService();
      const indexExists = (await esService.checkESConnection()) && (await esService.indexExists(indexName));

      if (!indexExists) {
        await esService.createIndex(indexName);
        strapi.log.info(`Created Elasticsearch index: ${indexName}`);
      }
    },

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

        const data = results[0];
        const indexData = collection.mapToIndex?(data) : data;

        const esService = getElasticsearchService();
        await esService.indexDataToSpecificIndex({ itemId, itemData: indexData }, collection.indexName);

        strapi.log.debug(`Indexed virtual item: ${collectionName}:${itemId}`);
        return indexData;
      } catch (error: any) {
        strapi.log.error(`Error indexing ${collectionName}:${itemId}: ${error?.message}`);
        throw error;
      }
    },

    async reindexAll(indexName: string) {
      const registry = getRegistryService();
      const collections = registry.getAll();

      let totalIndexed = 0;
      for (const collection of collections) {
        totalIndexed += await this.reindex(collection.collectionName, indexName);
      }

      console.log(`strapi-plugin-elasticsearch : Reindexed ${totalIndexed} items across all ${collections.length} virtual collections`);
      return totalIndexed;
    },

    /**
     * Reindex all items in a virtual collection
     */
    async reindex(collectionName: string, indexName: string) {
      const registry = getRegistryService();
      const collection = registry.get(collectionName);

      if (!collection) {
        throw new Error(`Virtual collection not found: ${collectionName}`);
      }

      try {
        const timestamp = Date.now();
        
        const esService = getElasticsearchService();
        // await esService.createIndex(tempIndexName);

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
          for (const item of pageData) {
            const itemData = collection.mapToIndex?(item) : item;
            operations.push({ itemId: item.id, itemData } );
          }

          if (operations.length > 0) {
            await Promise.all(operations.map((op) => esService.indexDataToSpecificIndex(op, indexName)));
          }

          totalIndexed += pageData.length;
          page++;
        }

        await esService.attachAliasToIndex(tempIndexName);

        strapi.log.info(`Reindexed ${totalIndexed} items for virtual collection: ${collectionName}`);
        return totalIndexed;
      } catch (error) {
        strapi.log.error(`Error reindexing ${collectionName}: ${error.message}`);
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
        const esService = getElasticsearchService();
        await esService.removeItemFromIndex({ itemId });

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
