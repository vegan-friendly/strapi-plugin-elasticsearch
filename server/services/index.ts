'use strict';

import configureIndexing from './configure-indexing';
import scheduleIndexing from './schedule-indexing';
import esInterface from './es-interface';
import indexer from './perform-indexing';
import logIndexing from './log-indexing';
import helper from './helper';
import transformContent from './transform-content';
import virtualCollectionsRegistry from './virtual-collections-registry';
import virtualCollectionsIndexer from './virtual-collections-indexer';

export default {
  configureIndexing,
  scheduleIndexing,
  esInterface,
  indexer,
  logIndexing,
  helper,
  transformContent,
  virtualCollectionsRegistry,
  virtualCollectionsIndexer,
};
