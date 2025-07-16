export default {
  // accessible only from admin UI
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/virtual-collections',
      handler: 'virtualCollections.getAll',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/virtual-collections/:collectionName/info',
      handler: 'virtualCollections.getCollectionInfo',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/virtual-collections/:collectionName/reindex',
      handler: 'virtualCollections.reindexCollection',
      config: { policies: [] },
    },
  ],
};
