import { EsInterfaceService, VirtualCollectionsRegistryService } from '../types';
import { HelperService } from '../types/helper-service.type';

export default ({ strapi }) => ({
  async rebuildIndex(item: any = null) {
    const helper: HelperService = strapi.plugins['elasticsearch'].services.helper;
    const esInterface: EsInterfaceService = strapi.plugins['elasticsearch'].services.esInterface;
    const scheduleIndexingService = strapi.plugins['elasticsearch'].services.scheduleIndexing;
    const configureIndexingService = strapi.plugins['elasticsearch'].services.configureIndexing;
    const logIndexingService = strapi.plugins['elasticsearch'].services.logIndexing;
    const virtualCollectionsIndexer = strapi.plugins['elasticsearch'].services['virtualCollectionsIndexer'];
    const virtualCollectionsRegistry: VirtualCollectionsRegistryService = strapi.plugins['elasticsearch'].services['virtualCollectionsRegistry'];

    try {
      console.log('strapi-plugin-elasticsearch : Request to rebuild the index received.');
      const fullIndexingInProgress = await scheduleIndexingService.getFullIndexingInProgress();
      if (fullIndexingInProgress.length > 0) {
        const msg = `Indexing is already in progress - see tasks ${fullIndexingInProgress.map((t) => t.id)}. This request is ignored and marked as failed.`;
        console.log('strapi-plugin-elasticsearch : ' + msg);
        await logIndexingService.recordIndexingFail(msg);
        return false;
      }

      const cols = await configureIndexingService.getCollectionsConfiguredForIndexing();
      const needsNewIndex = cols.length > 0 || virtualCollectionsRegistry.getAll().some((vc) => vc.indexAlias == null);

      const oldIndexName = await helper.getCurrentIndexName();
      console.log('strapi-plugin-elasticsearch : Recording the previous index name : ', oldIndexName);

      //Step 1 : Create a new index
      let newIndexName: string;
      if (needsNewIndex) {
        newIndexName = await helper.getIncrementedIndexName();
        await esInterface.createIndex(newIndexName);
        console.log('strapi-plugin-elasticsearch : Created new index with name : ', newIndexName);
      } else {
        newIndexName = oldIndexName;
        console.log(
          'strapi-plugin-elasticsearch : No need to create new index, as there are no collections to re-index, and no virtual-collections that use the default index. sticking to current index:',
          newIndexName
        );
      }

      //Step 2 : Index all the stuff on this new index
      console.log('strapi-plugin-elasticsearch : Starting to index all data into the new index.');
      if (item == null) {
        item = await scheduleIndexingService.addFullSiteIndexingTask();
      }

      if (item?.id) {
        await scheduleIndexingService.markIndexingTaskInProgress(item.id);
        let entitiesIndexed = 0;
        for (let r = 0; r < cols.length; r++) {
          entitiesIndexed += await this.indexCollection(cols[r], newIndexName);
        }

        // Indexing the virtual collections
        console.log('strapi-plugin-elasticsearch : Starting to index virtual collections. task id : ', item.id);
        const virtualEntriesIndexed = await virtualCollectionsIndexer.reindexAll(newIndexName);

        await scheduleIndexingService.markIndexingTaskComplete(item.id);

        console.log('strapi-plugin-elasticsearch : Indexing of data into the new index complete.');
        //Step 4 : Move the alias to this new index
        await esInterface.attachAliasToIndex(newIndexName);
        console.log('strapi-plugin-elasticsearch : Attaching the newly created index to the alias.');

        console.log('strapi-plugin-elasticsearch : Deleting the previous indices');
        //Step 5 : Delete the previous index
        await helper.deleteOldIndices();
        await logIndexingService.recordIndexingPass(
          `Re-index site-wide content completed successfully. ${entitiesIndexed} entries indexed. ${virtualEntriesIndexed} virtual entries indexed.`
        );

        return true;
      } else {
        await logIndexingService.recordIndexingFail('An error was encountered while trying site-wide re-indexing of content.');
        return false;
      }
    } catch (err) {
      console.log('strapi-plugin-elasticsearch : searchController : An error was encountered while re-indexing.');
      console.log(err);
      await logIndexingService.recordIndexingFail(err);
      throw err;
    } finally {
      if (item?.id) {
        await scheduleIndexingService.markIndexingTaskComplete(item.id);
      }
    }
  },
  async indexCollection(collectionName, indexName: string | null = null): Promise<number> {
    const helper = strapi.plugins['elasticsearch'].services.helper;
    const populateAttrib = helper.getPopulateAttribute({ collectionName });
    const isCollectionDraftPublish = helper.isCollectionDraftPublish({ collectionName });
    const configureIndexingService = strapi.plugins['elasticsearch'].services.configureIndexing;
    const esInterface = strapi.plugins['elasticsearch'].services.esInterface;
    if (indexName === null) indexName = await helper.getCurrentIndexName();
    let entries: { id: string; [key: string]: any }[] = []; //TODO: strapi should provide a type for this
    if (isCollectionDraftPublish) {
      entries = await strapi.entityService.findMany(collectionName, {
        sort: { createdAt: 'DESC' },
        populate: populateAttrib['populate'],
        filters: {
          publishedAt: {
            $notNull: true,
          },
        },
      });
    } else {
      entries = await strapi.entityService.findMany(collectionName, {
        sort: { createdAt: 'DESC' },
        populate: populateAttrib['populate'],
      });
    }
    if (entries) {
      for (let s = 0; s < entries.length; s++) {
        const item = entries[s];
        const indexItemId = helper.getIndexItemId({
          collectionName: collectionName,
          itemId: item.id,
        });
        const collectionConfig = await configureIndexingService.getCollectionConfig({
          collectionName,
        });
        const dataToIndex = await helper.extractDataToIndex({
          collectionName,
          data: item,
          collectionConfig,
        });
        await esInterface.indexDataToSpecificIndex({ itemId: indexItemId, itemData: dataToIndex }, indexName);
      }
    }
    return entries.length ?? 0;
  },
  async indexPendingData() {
    const scheduleIndexingService = strapi.plugins['elasticsearch'].services.scheduleIndexing;
    const configureIndexingService = strapi.plugins['elasticsearch'].services.configureIndexing;
    const logIndexingService = strapi.plugins['elasticsearch'].services.logIndexing;
    const esInterface: EsInterfaceService = strapi.plugins['elasticsearch'].services.esInterface;
    const helper = strapi.plugins['elasticsearch'].services.helper;
    const indexAlias = await strapi.config.get('plugin.elasticsearch').indexAliasName;
    const recs = await scheduleIndexingService.getItemsPendingToBeIndexed();
    const fullSiteIndexTasks = recs.filter((r) => r.full_site_indexing === true);
    const fullSiteIndexing = fullSiteIndexTasks.length > 0;
    if (fullSiteIndexing) {
      const success = await this.rebuildIndex(fullSiteIndexTasks[0]);
      if (success) {
        // Mark all pending tasks as complete, as they are implicitly covered by the full-site indexing.
        for (let r = 0; r < recs.length; r++) await scheduleIndexingService.markIndexingTaskComplete(recs[r].id);
      }
    } else {
      try {
        for (let r = 0; r < recs.length; r++) {
          const col = recs[r].collection_name;
          if (configureIndexingService.isCollectionConfiguredToBeIndexed(col)) {
            await scheduleIndexingService.markIndexingTaskInProgress(recs[r].id);
            //Indexing the individual item
            if (recs[r].item_id) {
              if (recs[r].indexing_type !== 'remove-from-index') {
                const populateAttrib = helper.getPopulateAttribute({ collectionName: col });
                const item = await strapi.entityService.findOne(col, recs[r].item_id, {
                  populate: populateAttrib['populate'],
                });
                const indexItemId = helper.getIndexItemId({ collectionName: col, itemId: item.id });
                const collectionConfig = await configureIndexingService.getCollectionConfig({
                  collectionName: col,
                });
                const dataToIndex = await helper.extractDataToIndex({
                  collectionName: col,
                  data: item,
                  collectionConfig,
                });
                await esInterface.indexData({ itemId: indexItemId, itemData: dataToIndex });
                await scheduleIndexingService.markIndexingTaskComplete(recs[r].id);
              } else {
                const indexItemId = helper.getIndexItemId({
                  collectionName: col,
                  itemId: recs[r].item_id,
                });
                await esInterface.removeItemFromIndex({ indexName: indexAlias, itemId: indexItemId });
                await scheduleIndexingService.markIndexingTaskComplete(recs[r].id);
              }
            } //index the entire collection
            else {
              //PENDING : Index an entire collection
              await this.indexCollection(col);
              await scheduleIndexingService.markIndexingTaskComplete(recs[r].id);
            }
          } else await scheduleIndexingService.markIndexingTaskComplete(recs[r].id);
        }
        await logIndexingService.recordIndexingPass('Indexing of ' + String(recs.length) + ' records complete.');
      } catch (err) {
        await logIndexingService.recordIndexingFail('Indexing of records failed - ' + ' ' + String(err));
        console.log(err);
        return false;
      }
    }
    return true;
  },
});
