import { Client } from '@elastic/elasticsearch';
import fs from 'fs';
import path from 'path';
import { EsInterfaceService } from '../types';
import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

let client: Client | null = null;

export default ({ strapi }): EsInterfaceService => ({
  async initializeSearchEngine({ host, auth, cert }) {
    try {
      client = new Client({
        node: host,
        auth: auth,
        tls: {
          ca: cert,
          rejectUnauthorized: false,
        },
      });
    } catch (err: any) {
      if (err?.message?.includes('ECONNREFUSED')) {
        console.error('strapi-plugin-elasticsearch : Connection to ElasticSearch at ', host, ' refused.');
        console.error(err);
      } else {
        console.error('strapi-plugin-elasticsearch : Error while initializing connection to ElasticSearch.');
        console.error(err);
      }
      throw err;
    }
  },
  async createIndex(indexName, mappings?: MappingTypeMapping) {
    try {
      const exists = await client!.indices.exists({ index: indexName });
      if (!exists) {
        console.log('strapi-plugin-elasticsearch : Search index ', indexName, ' does not exist. Creating index.');

        await client!.indices.create({
          index: indexName,
          mappings: mappings ?? undefined,
        });
      }
    } catch (err: any) {
      if (err?.message?.includes('ECONNREFUSED')) {
        console.log('strapi-plugin-elasticsearch : Error while creating index - connection to ElasticSearch refused.');
        console.log(err);
      } else {
        console.log('strapi-plugin-elasticsearch : Error while creating index.');
        console.log(err);
      }
    }
  },
  async deleteIndex(indexName) {
    try {
      await client!.indices.delete({
        index: indexName,
      });
    } catch (err: any) {
      if (err?.message?.includes('ECONNREFUSED')) {
        console.log('strapi-plugin-elasticsearch : Connection to ElasticSearch refused.');
        console.log(err);
      } else {
        console.log('strapi-plugin-elasticsearch : Error while deleting index to ElasticSearch.');
        console.log(err);
      }
    }
  },
  async attachAliasToIndex(indexName, optionalAliasName?: string, mappings?: MappingTypeMapping) {
    try {
      const pluginConfig = await strapi.config.get('plugin.elasticsearch');
      const aliasName = optionalAliasName ? optionalAliasName : pluginConfig.indexAliasName;
      const aliasExists = await client!.indices.existsAlias({ name: aliasName });
      if (aliasExists) {
        console.log('strapi-plugin-elasticsearch : Alias with this name already exists, removing it.');
        await client!.indices.deleteAlias({ index: '*', name: aliasName });
      }
      const indexExists = await client!.indices.exists({ index: indexName });
      if (!indexExists) await this.createIndex(indexName, mappings);
      console.log('strapi-plugin-elasticsearch : Attaching the alias ', aliasName, ' to index : ', indexName);
      await client!.indices.putAlias({ index: indexName, name: aliasName });
    } catch (err: any) {
      if (err?.message?.includes('ECONNREFUSED')) {
        console.log('strapi-plugin-elasticsearch : Attaching alias to the index - Connection to ElasticSearch refused.');
        console.log(err);
      } else {
        console.log('strapi-plugin-elasticsearch : Attaching alias to the index - Error while setting up alias within ElasticSearch.');
        console.log(err);
      }
    }
  },
  async checkESConnection() {
    if (!client) return false;
    try {
      await client?.ping();
      return true;
    } catch (error) {
      console.error('strapi-plugin-elasticsearch : Could not connect to Elastic search.');
      console.error(error);
      return false;
    }
  },
  async indexDataToSpecificIndex({ itemId, itemData }, iName) {
    try {
      await client!.index({
        index: iName,
        id: itemId,
        document: itemData,
      });
      //indices.refresh is an expensive operation. and ES is doing this once a second anyway (see https://www.elastic.co/guide/en/elasticsearch/reference/8.17/indices-refresh.html)
      // await client!.indices.refresh({ index: iName });
    } catch (err) {
      console.log('strapi-plugin-elasticsearch : Error encountered while indexing data to ElasticSearch.');
      console.log(err);
      throw err;
    }
  },
  async indexData({ itemId, itemData }) {
    const pluginConfig = await strapi.config.get('plugin.elasticsearch');
    return await this.indexDataToSpecificIndex({ itemId, itemData }, pluginConfig.indexAliasName);
  },
  async removeItemFromIndex({ indexName, itemId }) {
    try {
      await client!.delete({
        index: indexName,
        id: itemId,
      });
      await client!.indices.refresh({ index: indexName });
    } catch (err: any) {
      if (err?.meta?.statusCode === 404) console.error('strapi-plugin-elasticsearch : The entry to be removed from the index already does not exist.');
      else {
        console.error('strapi-plugin-elasticsearch : Error encountered while removing indexed data from ElasticSearch.');
        throw err;
      }
    }
  },
  async searchData(searchQuery) {
    try {
      const pluginConfig = await strapi.config.get('plugin.elasticsearch');
      const result = await client!.search({
        index: pluginConfig.indexAliasName,
        ...searchQuery,
      });
      return result;
    } catch (err) {
      console.log('Search : elasticClient.searchData : Error encountered while making a search request to ElasticSearch.');
      throw err;
    }
  },
  async listIndicesByPattern(pattern = 'restaurants*'): Promise<string[]> {
    const results = await client!.cat.indices({
      index: pattern,
      format: 'json',
    });

    return results.map((index) => index.index).filter((index) => index != null);
  },
});