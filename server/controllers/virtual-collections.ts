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

  const getEsInterface = () => {
    try {
      return strapi.service('plugin::elasticsearch.esInterface');
    } catch (err: any) {
      strapi.log.warn('ElasticSearch interface service not available:', err?.message || err);
      return null;
    }
  };

  const getHelper = () => {
    try {
      return strapi.plugins['elasticsearch'].services.helper;
    } catch (err: any) {
      strapi.log.warn('Helper service not available:', err?.message || err);
      return null;
    }
  };

  const getVirtualCollectionInfo = async (collection) => {
    const esInterface = getEsInterface();
    const helper = getHelper();

    if (!esInterface || !helper) {
      return {
        collectionName: collection.collectionName,
        indexAlias: collection.indexAlias,
        triggersCount: collection.triggers.length,
        triggerCollections: collection.triggers.map((t) => t.collection),
        currentIndex: null,
        matchingIndicesCount: 0,
        documentCount: 0,
        error: 'ElasticSearch services not available',
      };
    }

    try {
      const pattern = collection.indexAlias ? `${collection.indexAlias}_*` : 'strapi-plugin-elasticsearch-index_*';

      // Get current index from alias
      let currentIndex: string | null = null;
      let documentCount = 0;

      if (collection.indexAlias) {
        const aliasInfo = await esInterface.getAliasInfo(collection.indexAlias);
        if (aliasInfo) {
          const indices = Object.keys(aliasInfo);
          currentIndex = indices.length > 0 ? indices[0] : null;
        }
      } else {
        currentIndex = await helper.getCurrentIndexName();
      }

      // Get matching indices count
      const matchingIndices = await esInterface.listIndicesByPattern(pattern);
      const matchingIndicesCount = matchingIndices.length;

      // Get document count for current index
      if (currentIndex) {
        documentCount = await esInterface.getIndexDocumentCount(currentIndex);
      }

      return {
        collectionName: collection.collectionName,
        indexAlias: collection.indexAlias,
        triggersCount: collection.triggers.length,
        triggerCollections: collection.triggers.map((t) => t.collection),
        currentIndex,
        matchingIndicesCount,
        documentCount,
        error: null,
      };
    } catch (err: any) {
      strapi.log.error(`Error getting info for virtual collection ${collection.collectionName}:`, err);
      return {
        collectionName: collection.collectionName,
        indexAlias: collection.indexAlias,
        triggersCount: collection.triggers.length,
        triggerCollections: collection.triggers.map((t) => t.collection),
        currentIndex: null,
        matchingIndicesCount: 0,
        documentCount: 0,
        error: err?.message || 'Unknown error',
      };
    }
  };

  const getAll = async (ctx) => {
    try {
      const virtualCollectionsRegistry = getVirtualCollectionsRegistry();
      if (!virtualCollectionsRegistry) {
        return [];
      }

      const collections = virtualCollectionsRegistry.getAll();
      const result = await Promise.all(collections.map((collection) => getVirtualCollectionInfo(collection)));
      return result;
    } catch (err) {
      strapi.log.error('Error getting virtual collections:', err);
      ctx.throw(500, err);
    }
  };

  const getCollectionInfo = async (ctx) => {
    try {
      const { collectionName } = ctx.params;
      const virtualCollectionsRegistry = getVirtualCollectionsRegistry();

      if (!virtualCollectionsRegistry) {
        ctx.throw(503, 'Virtual collections registry service not available');
      }

      const collection = virtualCollectionsRegistry.get(collectionName);

      if (!collection) {
        ctx.throw(404, `Virtual collection not found: ${collectionName}`);
      }

      const result = await getVirtualCollectionInfo(collection);
      return result;
    } catch (err: any) {
      strapi.log.error(`Error getting virtual collection info ${ctx.params.collectionName}:`, err);
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
        message: `Successfully reindexed virtual collection: ${collectionName}`,
      };
    } catch (err: any) {
      strapi.log.error(`Error reindexing virtual collection ${ctx.params.collectionName}:`, err);
      ctx.throw(500, err);
    }
  };

  return {
    getAll,
    getCollectionInfo,
    reindexCollection,
  };
};
