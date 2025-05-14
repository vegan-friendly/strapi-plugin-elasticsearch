import {
  ExtractByIdsFunction,
  ExtractDataFunction,
  GetIdsToIndexFunction,
  GetIndexItemIdFunction,
  StrapiEntity,
  VirtualCollectionConfig,
  VirtualCollectionFactory,
  VirtualCollectionsRegistryService,
} from '../types';
import * as yup from 'yup';
import { HelperService } from '../types/helper-service.type';

const isFunction = <T extends {}>() => yup.mixed<T>().test('is-function', `must be a function`, (value) => typeof value === 'function');

const configSchema = yup.object({
  indexAlias: yup.string().notRequired().nonNullable(),
  collectionName: yup.string().required(),
  extractData: isFunction<ExtractDataFunction>().required(),
  extractByIds: isFunction<ExtractByIdsFunction>().required(),
  getIndexItemId: isFunction<GetIndexItemIdFunction>(),
  triggers: yup
    .array()
    .optional()
    .of(
      yup.object({
        collection: yup.string().required(),
        getIdsToReindex: isFunction<GetIdsToIndexFunction>().required(),
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
        const virtualCollectionsFactories = strapi.plugin('elasticsearch').config('virtualCollections') || [];
        config = virtualCollectionsFactories.map((factory: VirtualCollectionFactory) => {
          let collectionConfig: VirtualCollectionConfig = factory(strapi);
          collectionConfig = configSchema.validateSync(collectionConfig, { stripUnknown: true });
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
