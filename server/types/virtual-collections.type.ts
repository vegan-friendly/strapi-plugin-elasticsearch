'use strict';

import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export type VirtualCollectionConfig = {
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

  /**
   * The name of the virtual-collection.
   * You can use whatever name you want, but it's recommended to use the underlying collection api name,
   * e.g 'api::restaurants.restaurants'.
   */
  collectionName: string;
  extractData: (page: number, pageSize?: number) => Promise<StrapiEntity[]>;
  extractByIds: (ids: number[]) => Promise<StrapiEntity[]>;

  /**
   *  Optional -
   * A function that takes an item and returns the id of the item to be used in the index.
   * The default is <collectionName>::<itemId>
   *
   * @param itemId itemId in strapi
   * @param collectionName collection name. you probably want to use this to create a unique id for the item, especially if it is saved to the default index.
   * @returns the id of the item to be used in the index, _id. must be unique accross the index.
   */
  getIndexItemId?: (itemId: number, collectionName: string) => string;
  triggers: Array<{
    /**
     * collection name to listen to for changes.
     */
    collection: string;
    /**
     * gets an event on the given collection, and returns the ids of virtual-collection items to be reindexed.
     * @param event - The event object containing the data to be indexed.
     * @returns ids of the items to be reindexed.
     */
    getIdsToReindex: (event) => Promise<number[]>;
    /**
     * if true, and the trigger is a delete event, the item of the virtual collection will be deleted as well if the id returned from getIdsToReindex match.
     * defaults to false.
     */
    alsoTriggerDelete?: boolean;
  }>;

  /**
   * Optional schema to be sent to Elasticsearch when creating the index.
   * If you don't include this, ElasticSearch will automatically create a schema for you.
   */
  mappings?: MappingTypeMapping;
};

export interface VirtualCollectionsRegistryService {
  /**
   * get all registered virtual collections
   * @returns An array of all registered virtual collections
   */
  getAll(): Array<VirtualCollectionConfig>;
  get(collectionName: string): VirtualCollectionConfig | null;
  findTriggersByCollection(collectionUID: string): Array<VirtualCollectionConfig>;
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
  reindex(collection: VirtualCollectionConfig): Promise<any>;

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