import React, { useState, useEffect } from 'react';
import { SubNavigation } from '../../components/SubNavigation';
import { Box, Flex, Typography, Button, IconButton, Table, Tr, Td, Thead, Tbody, Th } from '@strapi/design-system';
import { apiGetVirtualCollections, apiReindexVirtualCollection } from '../../utils/apiUrls';
import axiosInstance from '../../utils/axiosInstance';
import { LoadingIndicatorPage, useNotification } from '@strapi/helper-plugin';
import { Refresh } from '@strapi/icons';
import pluginId from '../../pluginId';

interface VirtualCollection {
    collectionName: string;
    indexAlias?: string;
    triggersCount: number;
    triggerCollections: string[];
}

const loadVirtualCollections = async (): Promise<VirtualCollection[]> => {
  const resp = await axiosInstance.get(apiGetVirtualCollections);
  return resp.data;
};

const VirtualCollections = () => {
  const [virtualCollections, setVirtualCollections] = useState<VirtualCollection[] | null>(null);
  const [isInProgress, setIsInProgress] = useState(false);
  const [reindexingCollection, setReindexingCollection] = useState<string | null>(null);
  const toggleNotification = useNotification();
  console.log('VirtualCollections component rendering');

  const reloadVirtualCollections = async ({ showNotification }: { showNotification: boolean }) => {
    console.log('VirtualCollections component reloading');
    setIsInProgress(true);
    try {
      const collections = await loadVirtualCollections();
      setVirtualCollections(collections);
      console.log('VirtualCollections component reloaded.');
      if (showNotification) {
        toggleNotification({
          type: 'success',
          message: 'Virtual collections information reloaded.',
          timeout: 5000,
        });
      }
    } catch (err) {
      console.error('Error loading virtual collections:', err);
      setVirtualCollections([]); // Set empty array on error
      toggleNotification({
        type: 'warning',
        message: 'An error was encountered while loading virtual collections.',
        timeout: 5000,
      });
    } finally {
      setIsInProgress(false);
    }
  };

  const reindexVirtualCollection = async (collectionName: string) => {
    setReindexingCollection(collectionName);
    try {
      await axiosInstance.post(apiReindexVirtualCollection(collectionName));
      toggleNotification({
        type: 'success',
        message: `Virtual collection "${collectionName}" reindexing started successfully.`,
        timeout: 5000,
      });
    } catch (err) {
      toggleNotification({
        type: 'warning',
        message: `Failed to reindex virtual collection "${collectionName}".`,
        timeout: 5000,
      });
      console.error(err);
    } finally {
      setReindexingCollection(null);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await reloadVirtualCollections({ showNotification: false });
    };
    loadData();
  }, []);

  if (virtualCollections === null) return <LoadingIndicatorPage />;
  else
    return (
      <Flex alignItems="stretch" gap={4}>
        <SubNavigation activeUrl={`/plugins/${pluginId}/virtual-collections`} />
        <Box padding={8} background="neutral100" width="100%">
          <Box paddingBottom={4}>
            <Flex justifyContent="space-between" alignItems="center">
              <Typography variant="alpha">Virtual Collections</Typography>
              <IconButton
                disabled={isInProgress}
                onClick={() =>
                  reloadVirtualCollections({
                    showNotification: true,
                  })
                }
                label="Refresh"
                icon={<Refresh />}
              />
            </Flex>
          </Box>
          <Box width="100%" paddingBottom={4}>
            {virtualCollections && virtualCollections.length > 0 ? (
              <Table colCount={4} rowCount={virtualCollections.length}>
                <Thead>
                  <Tr>
                    <Th>
                      <Typography variant="sigma">Collection Name</Typography>
                    </Th>
                    <Th>
                      <Typography variant="sigma">Index Alias</Typography>
                    </Th>
                    <Th>
                      <Typography variant="sigma">Trigger Collections</Typography>
                    </Th>
                    <Th>
                      <Typography variant="sigma">Actions</Typography>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {virtualCollections.map((collection, index) => (
                    <Tr key={index}>
                      <Td>
                        <Typography textColor="neutral600" fontWeight="bold">
                          {collection.collectionName}
                        </Typography>
                      </Td>
                      <Td>
                        <Typography textColor="neutral600">{collection.indexAlias || 'Default Index'}</Typography>
                      </Td>
                      <Td>
                        <Box>
                          {collection.triggerCollections && collection.triggerCollections.length > 0 ? (
                            collection.triggerCollections.map((triggerCollection, idx) => (
                              <Box key={idx} paddingBottom={1}>
                                <Typography textColor="neutral600" fontSize={1}>
                                  {triggerCollection}
                                </Typography>
                              </Box>
                            ))
                          ) : (
                            <Typography textColor="neutral400" fontSize={1}>
                              No triggers
                            </Typography>
                          )}
                        </Box>
                      </Td>
                      <Td>
                        <Button
                          variant="secondary"
                          size="S"
                          loading={reindexingCollection === collection.collectionName}
                          disabled={isInProgress || reindexingCollection !== null}
                          onClick={() => reindexVirtualCollection(collection.collectionName)}
                        >
                          Reindex
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            ) : (
              <Box padding={8} background="neutral0" hasRadius>
                <Typography textAlign="center" textColor="neutral600">
                  No virtual collections configured.
                </Typography>
                <Typography textAlign="center" textColor="neutral500" fontSize={1} paddingTop={2}>
                  Virtual collections are configured in your Strapi application code.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Flex>
    );
};

export default VirtualCollections;
