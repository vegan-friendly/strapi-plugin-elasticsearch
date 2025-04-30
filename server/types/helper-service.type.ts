export type ElasticsearchInfo = {
    indexingCronSchedule: string;
    elasticHost: string;
    elasticUserName: string;
    elasticCertificate: string;
    elasticIndexAlias: number;
    connected: string;
    initialized: boolean;
};

export interface HelperService {
    getElasticsearchInfo(): Promise<ElasticsearchInfo>;
    isCollectionDraftPublish(args: { collectionName: string }): boolean;
    getPopulateAttribute(args: { collectionName: string }): true | { populate: object; } | undefined;
    getIndexItemId(args: { collectionName: string; itemId: number }): string;
    getCurrentIndexName(indexPrefix?: string): Promise<string>;
    getIncrementedIndexName(indexPrefix?: string): Promise<string>;
    deleteOldIndices(indexAlias?: string): Promise<string[]>;
    modifySubfieldsConfigForExtractor(collectionConfig: object): object;
    extractDataToIndex(args: { collectionName: string; data: object; collectionConfig: object }): any;
}

let a: Record<string, unknown> = {
    a: 1,
};

type NonRecordObject = {
    foo: string;
};

const example: NonRecordObject = { foo: "bar" };
a = example;
