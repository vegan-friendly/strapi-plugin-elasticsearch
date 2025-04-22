export interface EsInterfaceService {
  /**
   * Initializes the search engine connection.
   * @param params - Connection parameters that include host, uname, password, and cert.
   * @returns A promise that resolves when the initialization is complete.
   */
  initializeSearchEngine(params: { host: string; uname: string; password: string; cert: string }): Promise<void>;

  /**
   * Creates an index in the search engine.
   * @param indexName - The name of the index to create.
   * @returns A promise that resolves when the index is created.
   */
  createIndex(indexName: string): Promise<void>;

  /**
   * Deletes an index from the search engine.
   * @param indexName - The name of the index to delete.
   * @returns A promise that resolves when the index is deleted.
   */
  deleteIndex(indexName: string): Promise<void>;

  /**
   * Attaches an alias to a specific index.
   * @param indexName - The index to which the alias should be attached.
   * @returns A promise that resolves when the alias is set.
   */
  attachAliasToIndex(indexName: string): Promise<void>;

  /**
   * Checks the connection status of the search engine.
   * @returns A promise that resolves with the connection status.
   */
  checkESConnection(): Promise<any>;

  /**
   * Indexes data to a specific index.
   * @param data - An object containing the itemId and itemData to index.
   * @param data.itemId - The full ID of the item to index, in format `collectionName + '::' + itemId`.
   * @param indexName - The target index name.
   * @returns A promise that resolves when the data is indexed.
   */
  indexDataToSpecificIndex(data: { itemId: string; itemData: any }, indexName: string): Promise<any>;

  /**
   * Indexes data.
   * @param data - An object containing the itemId and itemData to index.
   * @returns A promise that resolves when the data is indexed.
   */
  indexData(data: { itemId: string; itemData: any }): Promise<any>;

  /**
   * Removes an item from the index.
   * @param data - An object containing the itemId.
   * @returns A promise that resolves when the item is removed.
   */
  removeItemFromIndex(data: { itemId: string }): Promise<any>;

  /**
   * Searches data in the search engine.
   * @param searchQuery - The search query.
   * @returns A promise that resolves with the search results.
   */
  searchData(searchQuery: any): Promise<any>;
}
