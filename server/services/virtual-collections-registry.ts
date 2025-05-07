import { StrapiEntity, VirtualCollectionConfig, VirtualCollectionsRegistryService } from '../types';
import * as yup from 'yup';
import { HelperService } from '../types/helper-service.type';

const isFunction = () => yup.mixed().test('is-function', `must be a function`, (value) => typeof value === 'function');

const configSchema = yup.object({
  indexAlias: yup.string().nullable(),
  collectionName: yup.string().required(),
  extractData: isFunction().required(),
  extractByIds: isFunction().required(),
  getIndexItemId: isFunction(),
  triggers: yup
    .array()
    .of(
      yup.object({
        collection: yup.string().required(),
        getIdsToReindex: isFunction(),
        alsoTriggerDelete: yup.boolean().default(false),
      })
    )
    .default([]),
  mappings: yup.object().default({}),
});

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
  let config;

  return {
    getAll() {
      if (!config) {
        const helper: HelperService = strapi.plugin('elasticsearch').service('helper');
        const defaultConf = configSchema.getDefault();
        config = strapi.plugin('elasticsearch').config('virtualCollections') || [];
        config = config.map((collection: VirtualCollectionConfig) => {
          const collectionConfig = configSchema.validateSync(collection, { strict: true });
          collectionConfig.getIndexItemId = collectionConfig.getIndexItemId || ((id) => helper.getIndexItemId({ collectionName: collectionConfig.collectionName, itemId: id }));
          return { ...defaultConf, ...collectionConfig };
        });
      }
      return config;
    },

    get(collectionName) {
      return this.getAll().find((collection) => collection.collectionName === collectionName) ?? null;
    },

    findTriggersByCollection: function (collectionUID: string): Array<VirtualCollectionConfig> {
      return this.getAll().filter((collection) => {
        return collection.triggers.some((trigger) => trigger.collection === collectionUID);
      });
    },
  };
};
