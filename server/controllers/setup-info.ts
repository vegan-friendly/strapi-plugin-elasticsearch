'use strict';

export default ({ strapi }) => {
  const helperService = strapi.plugins['elasticsearch'].services.helper;
  const getElasticsearchInfo = async (ctx) => {
    return helperService.getElasticsearchInfo();
  };

  return {
    getElasticsearchInfo,
  };
};