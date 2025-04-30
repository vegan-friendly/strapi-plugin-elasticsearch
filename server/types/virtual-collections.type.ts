'use strict';

import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export type VirtualCollectionConfig<T extends StrapiEntity> = {
  /**
   * Optional -
   * The alias of the latest index in Elasticsearch.
   * It also serves as a prefix to actual indexes created in Elasticsearch.
   * The actuall index name will be the `${indexNameBase}_${ind}`, e.g `restaurants_000001` and so on.
   * and the alias will be the `indexNameBase`.
   *
   * If you don't provide this, the default index name will be used as the alias.
   * Omit this property if you want to use the default index for all collections.
   */
  indexAlias?: string;
  collectionName: string;
  extractData: (page: number, pageSize?: number) => Promise<T[]>;
  extractByIds: (ids: number[]) => Promise<T[]>;
  triggers: Array<{
    collection: string;
    getIdsToReindex: (result) => Promise<number[]>;
  }>;

  /**
   * Optional schema to be sent to Elasticsearch when creating the index.
   * If you don't include this, ElasticSearch will automatically create a schema for you.
   */
  mappings?: MappingTypeMapping;
};

export interface VirtualCollectionsRegistryService {
  /**
   * Register a virtual collection
   * @param config - The configuration for the virtual collection
   * @returns The current instance of the registry
   */
  register<T extends StrapiEntity>(config: VirtualCollectionConfig<T>): this;

  /**
   * get all registered virtual collections
   * @returns An array of all registered virtual collections
   */
  getAll(): Array<VirtualCollectionConfig<any>>;
  get(collectionName: string): VirtualCollectionConfig<any> | null;
  findTriggersByCollection(collectionUID: string): Array<VirtualCollectionConfig<any>>;
}

export type StrapiEntity = { id: number; [key: string]: any };

export interface VirtualCollectionsIndexerService {
  /**
   * Index a single item from a virtual collection.
   * @param collectionName - The name of the virtual collection.
   * @param itemId - The id of the item to be indexed.
   */
  indexItem(collectionName: string, itemId: number): Promise<any>;

  /**
   * Reindex all items in a virtual collection index.
   */
  reindexAll(): Promise<any>;

  /**
   * Reindex all items in a virtual collection.
   * @param collection - The virtual collection config.
   */
  reindex<T extends StrapiEntity>(collection: VirtualCollectionConfig<T>): Promise<any>;

  /**
   * Handle a trigger event from a collection.
   * @param event - The trigger event.
   */
  handleTriggerEvent(event: any): Promise<any>;

  /**
   * Delete an item from a virtual collection index.
   * @param collectionName - The name of the virtual collection.
   * @param itemId - The id of the item to be deleted.
   * @returns A promise that resolves to a boolean indicating success.
   */
  deleteItem(collectionName: string, itemId: number): Promise<boolean>;
}