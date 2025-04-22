'use strict';

export type VirtualCollectionConfig<T extends {}> = {
  indexName: string;
  collectionName: string;
  extractData: (page: number, pageSize?: number) => Promise<T[]>;
  extractById: (ids: number[]) => Promise<T[]>;
  triggers: Array<{
    collection: string;
    getIdsToReindex: (result) => Promise<number[]>;
  }>;
  mapToIndex?: (item: T) => Promise<object>;
};

export interface VirtualCollectionsRegistryService {

  /**
   * Register a virtual collection
   * @param config - The configuration for the virtual collection
   * @returns The current instance of the registry
   */
  register<T extends {}>(config: VirtualCollectionConfig<T>): this;

  /**
   * get all registered virtual collections
   * @returns An array of all registered virtual collections
   */
  getAll(): Array<VirtualCollectionConfig<any>>;
  get(collectionName: string): VirtualCollectionConfig<any> | null;
  findTriggersByCollection(collectionUID: string): Array<VirtualCollectionConfig<any>>;

}

export interface VirtualCollectionsIndexerService {
  /**
   * Index a single item from a virtual collection.
   * @param collectionName - The name of the virtual collection.
   * @param itemId - The id of the item to be indexed.
   */
  indexItem(collectionName: string, itemId: number): Promise<any>;

  /**
   * Reindex all items in a virtual collection index.
   * @param indexName - The target index name.
   */
  reindexAll(indexName: string): Promise<any>;

  /**
   * Reindex all items in a virtual collection.
   * @param collectionName - The name of the virtual collection.
   * @param indexName - The target index name.
   */
  reindex(collectionName: string, indexName: string): Promise<any>;

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
  deleteItem(collectionName: string, itemId: string): Promise<boolean>;
}