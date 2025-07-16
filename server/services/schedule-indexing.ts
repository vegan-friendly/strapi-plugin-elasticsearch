
const STUCK_THRESHOLD_SECONDS: number = 60 * 60; // 1 hour

export default ({ strapi }) => ({
  async addFullSiteIndexingTask() {
    const data = await strapi.entityService.create('plugin::elasticsearch.task', {
      data: {
        collection_name: '',
        indexing_status: 'to-be-done',
        full_site_indexing: true,
        indexing_type: 'add-to-index',
      },
    });
    return data;
  },
  async addCollectionToIndex({ collectionUid }) {
    const data = await strapi.entityService.create('plugin::elasticsearch.task', {
      data: {
        collection_name: collectionUid,
        indexing_status: 'to-be-done',
        full_site_indexing: false,
        indexing_type: 'add-to-index',
      },
    });
    return data;
  },
  async addItemToIndex({ collectionUid, recordId }) {
    const data = await strapi.entityService.create('plugin::elasticsearch.task', {
      data: {
        item_id: recordId,
        collection_name: collectionUid,
        indexing_status: 'to-be-done',
        full_site_indexing: false,
        indexing_type: 'add-to-index',
      },
    });
    return data;
  },
  async removeItemFromIndex({ collectionUid, recordId }) {
    const data = await strapi.entityService.create('plugin::elasticsearch.task', {
      data: {
        item_id: recordId,
        collection_name: collectionUid,
        indexing_status: 'to-be-done',
        full_site_indexing: false,
        indexing_type: 'remove-from-index',
      },
    });
  },
  async getItemsPendingToBeIndexed() {
    const entries = await strapi.entityService.findMany('plugin::elasticsearch.task', {
      filters: { indexing_status: 'to-be-done' },
    });
    return entries;
  },
  async markIndexingTaskComplete(recId, error: string | null = null) {
    const status = error ? 'failed' : 'done';
    const entries = await strapi.entityService.update('plugin::elasticsearch.task', recId, {
      data: {
        indexing_status: status,
        error_message: error?.slice(0, 255) || null,
      },
    });
  },
  async markIndexingTaskInProgress(recId) {
    await strapi.entityService.update('plugin::elasticsearch.task', recId, {
      data: {
        indexing_status: 'in-progress',
      },
    });
  },

  async getActiveFullIndexingTasks(staleTaskThresholdSeconds?: number) {
    if (!staleTaskThresholdSeconds) {
      staleTaskThresholdSeconds = Number(strapi.config.get('plugin.elasticsearch').staleTaskThresholdSeconds) || STUCK_THRESHOLD_SECONDS;
    }
    staleTaskThresholdSeconds *= 1000;

    const entries = await strapi.entityService.findMany('plugin::elasticsearch.task', {
      filters: {
        indexing_status: 'in-progress',
        full_site_indexing: true,
      },
    });
    const now = Date.now();
    const activeTasks: any[] = [];
    for (const t of entries) {
      const updatedAt = new Date(t.updatedAt || t.createdAt).getTime();
      if (now - updatedAt > staleTaskThresholdSeconds) {
        await strapi.plugins['elasticsearch'].services.logIndexing.recordIndexingFail(`Task ${t.id} was stuck in-progress for too long. Marking as failed.`);
        await this.markIndexingTaskComplete(t.id, 'Stuck in-progress');
      } else {
        activeTasks.push(t);
      }
    }
    return activeTasks;
  },
});
