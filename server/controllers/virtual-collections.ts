export default ({ strapi }) => {
  const getVirtualCollectionsIndexer = () => {
    try {
      return strapi.service('plugin::elasticsearch.virtualCollectionsIndexer');
    } catch (err: any) {
      strapi.log.warn('Virtual collections indexer service not available:', err?.message || err);
      return null;
    }
  };

  const getVirtualCollectionsRegistry = () => {
    try {
      return strapi.service('plugin::elasticsearch.virtualCollectionsRegistry');
    } catch (err: any) {
      strapi.log.warn('Virtual collections registry service not available:', err?.message || err);
      return null;
    }
  };

  const getAll = async (ctx) => {
    try {
      const virtualCollectionsRegistry = getVirtualCollectionsRegistry();
      if (!virtualCollectionsRegistry) {
        return [];
      }

      const collections = virtualCollectionsRegistry.getAll();
      const result = collections.map(collection => ({
        collectionName: collection.collectionName,
        indexAlias: collection.indexAlias,
        triggersCount: collection.triggers.length,
        triggerCollections: collection.triggers.map(t => t.collection)
      }));
      return result;
    } catch (err) {
      strapi.log.error('Error getting virtual collections:', err);
      ctx.throw(500, err);
    }
  };

  const reindexCollection = async (ctx) => {
    try {
      const { collectionName } = ctx.params;
      const virtualCollectionsRegistry = getVirtualCollectionsRegistry();
      const virtualCollectionsIndexer = getVirtualCollectionsIndexer();
      
      if (!virtualCollectionsRegistry || !virtualCollectionsIndexer) {
        ctx.throw(503, 'Virtual collections services not available');
      }

      const collection = virtualCollectionsRegistry.get(collectionName);
      
      if (!collection) {
        ctx.throw(404, `Virtual collection not found: ${collectionName}`);
      }

      await virtualCollectionsIndexer.reindex(collection);
      
      return { 
        success: true, 
        message: `Successfully reindexed virtual collection: ${collectionName}` 
      };
    } catch (err: any) {
      strapi.log.error(`Error reindexing virtual collection ${ctx.params.collectionName}:`, err);
      ctx.throw(500, err);
    }
  };

  return {
    getAll,
    reindexCollection,
  };
};
