import { VirtualCollectionConfig, VirtualCollectionsRegistryService } from '../types';

/**
 * Service to handle indexing of virtual collections
 */
export default ({ strapi }): VirtualCollectionsRegistryService => {
  // const getElasticsearchService = () => strapi.plugin('elasticsearch').service('esInterface');
  // const getAll = () => {
  //   const config = strapi.plugin('elasticsearch').config('virtualCollections');
  //   return config || [];
  // };
  // const get = (collectionName) => {
  //   return getAll().find((collection) => collection.collectionName === collectionName);
  // };

  return {
    getAll() {
      const config = strapi.plugin('elasticsearch').config('virtualCollections');
      return config || [];
    },

    get(collectionName) {
      return this.getAll().find((collection) => collection.collectionName === collectionName) ?? null;
    },

    register: function <T extends {}>(config: VirtualCollectionConfig<T>): VirtualCollectionsRegistryService {
      throw new Error('Function not implemented.');
    },

    findTriggersByCollection: function (collectionUID: string): Array<VirtualCollectionConfig<any>> {
      return this.getAll().filter((collection) => {
        return collection.triggers.some((trigger) => trigger.collection === collectionUID);
      });
    },
  };
};
