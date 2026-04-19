import { useEffect, useRef } from 'react';
import {
  updateCookies,
  updatePreferences,
  setGitVersion
} from 'providers/ReduxStore/slices/app';
import {
  addTab,
  focusTab
} from 'providers/ReduxStore/slices/tabs';
import {
  brunoConfigUpdateEvent,
  collectionAddDirectoryEvent,
  collectionAddFileEvent,
  collectionChangeFileEvent,
  collectionRenamedEvent,
  collectionUnlinkDirectoryEvent,
  collectionUnlinkEnvFileEvent,
  collectionUnlinkFileEvent,
  processEnvUpdateEvent,
  workspaceEnvUpdateEvent,
  requestCancelled,
  runFolderEvent,
  runRequestEvent,
  scriptEnvironmentUpdateEvent,
  streamDataReceived,
  setDotEnvVariables
} from 'providers/ReduxStore/slices/collections';
import {
  collectionAddEnvFileEvent,
  openCollectionEvent,
  hydrateCollectionWithUiStateSnapshot,
  mergeAndPersistEnvironment,
  selectEnvironment
} from 'providers/ReduxStore/slices/collections/actions';
import {
  workspaceOpenedEvent,
  workspaceConfigUpdatedEvent,
  restoreSession,
  getLastSessionState,
  clearLastSessionState,
  cleanupFailedCollections
} from 'providers/ReduxStore/slices/workspaces/actions';
import { workspaceDotEnvUpdateEvent, setWorkspaceDotEnvVariables } from 'providers/ReduxStore/slices/workspaces';
import toast from 'react-hot-toast';
import { useDispatch, useStore } from 'react-redux';
import { isElectron } from 'utils/common/platform';
import { globalEnvironmentsUpdateEvent, updateGlobalEnvironments } from 'providers/ReduxStore/slices/global-environments';
import { collectionAddOauth2CredentialsByUrl, collectionClearOauth2CredentialsByCredentialsId, updateCollectionLoadingState } from 'providers/ReduxStore/slices/collections/index';
import { addLog } from 'providers/ReduxStore/slices/logs';
import { updateSystemResources } from 'providers/ReduxStore/slices/performance';
import { apiSpecAddFileEvent, apiSpecChangeFileEvent } from 'providers/ReduxStore/slices/apiSpec';
import { findItemInCollection } from 'utils/collections';

const useIpcEvents = () => {
  const dispatch = useDispatch();
  const store = useStore();

  const sessionStateRef = useRef({
    isRestoring: false,
    hasRestored: false,
    pendingSession: null,
    pendingCollections: [],
    pendingCollectionUids: new Set(),
    openedCollectionUids: new Set(),
    restoreTimeoutId: null,
    failedCollectionPaths: [],
    allCollectionPaths: []
  });

  const clearSessionRestoreState = () => {
    const state = sessionStateRef.current;
    state.isRestoring = false;
    state.pendingSession = null;
    state.pendingCollections = [];
    state.pendingCollectionUids = new Set();
    state.openedCollectionUids = new Set();
    state.failedCollectionPaths = [];
    state.allCollectionPaths = [];
    if (state.restoreTimeoutId) {
      clearTimeout(state.restoreTimeoutId);
      state.restoreTimeoutId = null;
    }
  };

  const cleanupUnopenedCollections = async () => {
    const state = sessionStateRef.current;

    const unopenedPaths = [];
    const unopenedCollectionUids = new Set();

    for (const collection of state.pendingCollections) {
      if (!state.openedCollectionUids.has(collection.uid)) {
        unopenedPaths.push(collection.pathname);
        unopenedCollectionUids.add(collection.uid);
      }
    }

    if (unopenedPaths.length === 0) {
      return { unopenedPaths: [], cleaned: false, updated: false };
    }

    console.warn('Cleaning up unopened collections:', unopenedPaths);

    let cleanupResult = { cleaned: [], cleanedCollectionUids: [], updated: false };
    try {
      cleanupResult = await dispatch(cleanupFailedCollections(unopenedPaths));
    } catch (error) {
      console.error('Failed to cleanup unopened collections:', error);
    }

    if (state.pendingSession) {
      const openedUids = state.openedCollectionUids;

      const updatedCollections = state.pendingSession.collections?.filter((c) => 
        openedUids.has(c.uid)
      ) || [];

      const updatedTabs = state.pendingSession.tabs?.filter((t) => 
        openedUids.has(t.collectionUid)
      ) || [];

      let updatedActiveTabUid = state.pendingSession.activeTabUid;
      if (state.pendingSession.activeTabUid) {
        const activeTabIsInCleanedTabs = updatedTabs.find((t) => t.uid === state.pendingSession.activeTabUid);
        if (!activeTabIsInCleanedTabs) {
          updatedActiveTabUid = updatedTabs.length > 0 ? updatedTabs[0].uid : null;
        }
      }

      state.pendingSession = {
        ...state.pendingSession,
        collections: updatedCollections,
        tabs: updatedTabs,
        activeTabUid: updatedActiveTabUid
      };
    }

    return { 
      unopenedPaths, 
      unopenedCollectionUids: Array.from(unopenedCollectionUids),
      cleaned: cleanupResult.cleaned || [],
      cleanedCollectionUids: cleanupResult.cleanedCollectionUids || [],
      updated: cleanupResult.updated || (unopenedPaths.length > 0)
    };
  };

  const restoreSessionTabsAndEnvironment = (session, openedCollectionUids) => {
    const state = sessionStateRef.current;

    if (!session || state.hasRestored) {
      clearSessionRestoreState();
      return;
    }

    state.hasRestored = true;

    const openedUids = openedCollectionUids || state.openedCollectionUids;

    const currentState = store.getState();

    if (session.collections && session.collections.length > 0) {
      for (const sessionCollection of session.collections) {
        if (!openedUids.has(sessionCollection.uid)) {
          continue;
        }

        if (sessionCollection.selectedEnvironmentUid) {
          const collectionExists = currentState.collections.collections.find(
            (c) => c.uid === sessionCollection.uid
          );
          if (collectionExists) {
            dispatch(selectEnvironment(sessionCollection.selectedEnvironmentUid, sessionCollection.uid));
          }
        }
      }
    }

    let restoredTabUids = new Set();

    if (session.tabs && session.tabs.length > 0) {
      const latestState = store.getState();
      const tabsToRestore = [];

      for (const tab of session.tabs) {
        if (!openedUids.has(tab.collectionUid)) {
          continue;
        }

        const collection = latestState.collections.collections.find(
          (c) => c.uid === tab.collectionUid
        );

        if (!collection) {
          continue;
        }

        if (['workspaceOverview', 'workspaceEnvironments'].includes(tab.type)) {
          tabsToRestore.push(tab);
          restoredTabUids.add(tab.uid);
          continue;
        }

        if (tab.type === 'request' || tab.type === 'grpc-request' || tab.type === 'ws-request' || tab.type === 'graphql-request') {
          const item = findItemInCollection(collection, tab.uid);
          if (item) {
            tabsToRestore.push(tab);
            restoredTabUids.add(tab.uid);
          }
          continue;
        }

        const nonReplaceableTabTypes = [
          'variables',
          'collection-runner',
          'environment-settings',
          'global-environment-settings',
          'preferences',
          'openapi-sync',
          'openapi-spec'
        ];
        if (nonReplaceableTabTypes.includes(tab.type)) {
          tabsToRestore.push(tab);
          restoredTabUids.add(tab.uid);
        }
      }

      for (const tab of tabsToRestore) {
        dispatch(addTab(tab));
      }

      if (session.activeTabUid) {
        if (restoredTabUids.has(session.activeTabUid)) {
          dispatch(focusTab({ uid: session.activeTabUid }));
        } else if (tabsToRestore.length > 0) {
          const firstRestorableTab = tabsToRestore[0];
          dispatch(focusTab({ uid: firstRestorableTab.uid }));
        }
      }
    }

    clearSessionRestoreState();
  };

  useEffect(() => {
    if (!isElectron()) {
      return () => {};
    }

    const { ipcRenderer } = window;

    const _collectionTreeUpdated = (type, val) => {
      if (window.__IS_DEV__) {
        console.log(type);
        console.log(val);
      }
      if (type === 'addDir') {
        dispatch(
          collectionAddDirectoryEvent({
            dir: val
          })
        );
      }
      if (type === 'addFile') {
        dispatch(
          collectionAddFileEvent({
            file: val
          })
        );
      }
      if (type === 'change') {
        dispatch(
          collectionChangeFileEvent({
            file: val
          })
        );
      }
      if (type === 'unlink') {
        setTimeout(() => {
          dispatch(
            collectionUnlinkFileEvent({
              file: val
            })
          );
        }, 100);
      }
      if (type === 'unlinkDir') {
        dispatch(
          collectionUnlinkDirectoryEvent({
            directory: val
          })
        );
      }
      if (type === 'addEnvironmentFile') {
        dispatch(collectionAddEnvFileEvent(val));
      }
      if (type === 'unlinkEnvironmentFile') {
        dispatch(collectionUnlinkEnvFileEvent(val));
      }
    };

    const _apiSpecTreeUpdated = (type, val) => {
      if (window.__IS_DEV__) {
        console.log('API Spec update:', type);
        console.log(val);
      }
      if (type === 'addFile') {
        dispatch(apiSpecAddFileEvent({ data: val }));
      }
      if (type === 'changeFile') {
        dispatch(apiSpecChangeFileEvent({ data: val }));
      }
    };

    ipcRenderer.invoke('renderer:ready');

    const removeCollectionTreeUpdateListener = ipcRenderer.on('main:collection-tree-updated', _collectionTreeUpdated);

    const removeApiSpecTreeUpdateListener = ipcRenderer.on('main:apispec-tree-updated', _apiSpecTreeUpdated);

    const removeOpenCollectionListener = ipcRenderer.on('main:collection-opened', async (pathname, uid, brunoConfig) => {
      await dispatch(openCollectionEvent(uid, pathname, brunoConfig));

      const state = sessionStateRef.current;
      if (state.isRestoring && state.pendingCollectionUids.has(uid)) {
        state.pendingCollectionUids.delete(uid);
        state.openedCollectionUids.add(uid);

        if (state.pendingCollectionUids.size === 0 && state.pendingSession) {
          restoreSessionTabsAndEnvironment(state.pendingSession, state.openedCollectionUids);
        }
      }
    });

    const removeWorkspacesReadyListener = ipcRenderer.on('main:workspaces-ready', async () => {
      const state = sessionStateRef.current;

      if (state.hasRestored || state.isRestoring) {
        return;
      }

      state.isRestoring = true;

      try {
        const result = await dispatch(restoreSession());

        if (!result.success) {
          console.error('Session restoration failed:', result.error);
          try {
            await dispatch(clearLastSessionState());
          } catch (clearError) {
            console.error('Failed to clear dirty session:', clearError);
          }
          clearSessionRestoreState();
          return;
        }

        const session = result.session;

        if (!session) {
          clearSessionRestoreState();
          return;
        }

        if (result.hasFailedCollections && result.failedCollections && result.failedCollections.length > 0) {
          console.warn('Found failed collections during session restore:', result.failedCollections);
          state.failedCollectionPaths = result.failedCollections.map((c) => c.path);
        }

        if (result.hasInvalidPaths && result.allInvalidPaths && result.allInvalidPaths.length > 0) {
          console.warn('Found invalid collection paths during session restore:', result.allInvalidPaths);
        }

        if (!session.collections || session.collections.length === 0) {
          clearSessionRestoreState();
          return;
        }

        state.allCollectionPaths = session.collections.map((c) => c.pathname);

        const currentState = store.getState();
        const collectionUidsToWait = new Set();
        const collectionsToWait = [];

        for (const sessionCollection of session.collections) {
          const collectionAlreadyLoaded = currentState.collections.collections.find(
            (c) => c.uid === sessionCollection.uid
          );
          if (!collectionAlreadyLoaded) {
            collectionUidsToWait.add(sessionCollection.uid);
            collectionsToWait.push(sessionCollection);
          } else {
            state.openedCollectionUids.add(sessionCollection.uid);
          }
        }

        if (collectionUidsToWait.size > 0) {
          state.pendingSession = session;
          state.pendingCollectionUids = collectionUidsToWait;
          state.pendingCollections = collectionsToWait;

          state.restoreTimeoutId = setTimeout(async () => {
            console.warn('Session restore timeout - some collections may not have loaded');

            if (!state.hasRestored) {
              const cleanupResult = await cleanupUnopenedCollections();

              if (state.pendingSession && state.openedCollectionUids.size > 0) {
                const sessionHasRestorableContent = 
                  state.pendingSession.collections && state.pendingSession.collections.length > 0 ||
                  state.pendingSession.tabs && state.pendingSession.tabs.length > 0;

                if (sessionHasRestorableContent) {
                  restoreSessionTabsAndEnvironment(state.pendingSession, state.openedCollectionUids);
                } else {
                  try {
                    await dispatch(clearLastSessionState());
                  } catch (clearError) {
                    console.error('Failed to clear empty session:', clearError);
                  }
                  clearSessionRestoreState();
                }
              } else {
                try {
                  await dispatch(clearLastSessionState());
                } catch (clearError) {
                  console.error('Failed to clear session with no opened collections:', clearError);
                }
                clearSessionRestoreState();
              }
            }
          }, 10000);
        } else {
          restoreSessionTabsAndEnvironment(session, state.openedCollectionUids);
        }
      } catch (error) {
        console.error('Unexpected error during session restore:', error);
        try {
          await dispatch(clearLastSessionState());
        } catch (clearError) {
          console.error('Failed to clear dirty session:', clearError);
        }
        clearSessionRestoreState();
      }
    });

    const removeOpenWorkspaceListener = ipcRenderer.on('main:workspace-opened', (workspacePath, workspaceUid, workspaceConfig) => {
      dispatch(workspaceOpenedEvent(workspacePath, workspaceUid, workspaceConfig));
    });

    const removeWorkspaceConfigUpdatedListener = ipcRenderer.on('main:workspace-config-updated', (workspacePath, workspaceUid, workspaceConfig) => {
      dispatch(workspaceConfigUpdatedEvent(workspacePath, workspaceUid, workspaceConfig));
    });

    const removeWorkspaceEnvironmentAddedListener = ipcRenderer.on('main:workspace-environment-added', (workspaceUid, file) => {
      const state = store.getState();
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeWorkspaceEnvironmentChangedListener = ipcRenderer.on('main:workspace-environment-changed', (workspaceUid, file) => {
      const state = store.getState();
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeWorkspaceEnvironmentDeletedListener = ipcRenderer.on('main:workspace-environment-deleted', (workspaceUid, environmentUid) => {
      const state = store.getState();
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeDisplayErrorListener = ipcRenderer.on('main:display-error', (error) => {
      if (typeof error === 'string') {
        return toast.error(error || 'Something went wrong!');
      }
      if (typeof error === 'object') {
        return toast.error(error.message || 'Something went wrong!');
      }
    });

    const removeScriptEnvUpdateListener = ipcRenderer.on('main:script-environment-update', (val) => {
      dispatch(scriptEnvironmentUpdateEvent(val));
    });

    const removePersistentEnvVariablesUpdateListener = ipcRenderer.on('main:persistent-env-variables-update', (val) => {
      dispatch(mergeAndPersistEnvironment(val));
    });

    const removeGlobalEnvironmentVariablesUpdateListener = ipcRenderer.on('main:global-environment-variables-update', (val) => {
      dispatch(globalEnvironmentsUpdateEvent(val));
    });

    const removeCollectionRenamedListener = ipcRenderer.on('main:collection-renamed', (val) => {
      dispatch(collectionRenamedEvent(val));
    });

    const removeRunFolderEventListener = ipcRenderer.on('main:run-folder-event', (val) => {
      dispatch(runFolderEvent(val));
    });

    const removeRunRequestEventListener = ipcRenderer.on('main:run-request-event', (val) => {
      dispatch(runRequestEvent(val));
    });

    const removeProcessEnvUpdatesListener = ipcRenderer.on('main:process-env-update', (val) => {
      dispatch(processEnvUpdateEvent(val));
    });

    const removeWorkspaceDotEnvUpdatesListener = ipcRenderer.on('main:workspace-dotenv-update', (val) => {
      dispatch(workspaceDotEnvUpdateEvent(val));
      dispatch(workspaceEnvUpdateEvent({ processEnvVariables: val.processEnvVariables }));
    });

    const removeDotEnvFileUpdateListener = ipcRenderer.on('main:dotenv-file-update', (val) => {
      const { type, collectionUid, workspaceUid, filename, variables, exists, processEnvVariables } = val;

      if (type === 'collection' && collectionUid) {
        dispatch(setDotEnvVariables({
          collectionUid,
          variables,
          exists,
          filename
        }));
        if (filename === '.env') {
          dispatch(processEnvUpdateEvent({ collectionUid, processEnvVariables }));
        }
      } else if (type === 'workspace' && workspaceUid) {
        dispatch(setWorkspaceDotEnvVariables({
          workspaceUid,
          variables,
          exists,
          filename
        }));
        if (filename === '.env') {
          dispatch(workspaceDotEnvUpdateEvent(val));
          dispatch(workspaceEnvUpdateEvent({ processEnvVariables }));
        }
      }
    });

    const removeConsoleLogListener = ipcRenderer.on('main:console-log', (val) => {
      console[val.type](...val.args);
      dispatch(addLog({
        type: val.type,
        args: val.args,
        timestamp: new Date().toISOString()
      }));
    });

    const removeSystemResourcesListener = ipcRenderer.on('main:filesync-system-resources', (resourceData) => {
      dispatch(updateSystemResources(resourceData));
    });

    const removeConfigUpdatesListener = ipcRenderer.on('main:bruno-config-update', (val) =>
      dispatch(brunoConfigUpdateEvent(val))
    );

    const removeShowPreferencesListener = ipcRenderer.on('main:open-preferences', () => {
      const state = store.getState();
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      const workspaces = state.workspaces?.workspaces;
      const tabs = state.tabs?.tabs;
      const activeTabUid = state.tabs?.activeTabUid;
      const activeTab = tabs?.find((t) => t.uid === activeTabUid);

      const activeWorkspace = workspaces?.find((w) => w.uid === activeWorkspaceUid);
      const collectionUid = activeTab?.collectionUid || activeWorkspace?.scratchCollectionUid;

      dispatch(
        addTab({
          type: 'preferences',
          uid: collectionUid ? `${collectionUid}-preferences` : 'preferences',
          collectionUid
        })
      );
    });

    const removePreferencesUpdatesListener = ipcRenderer.on('main:load-preferences', (val) => {
      dispatch(updatePreferences(val));
    });

    const removeCookieUpdateListener = ipcRenderer.on('main:cookies-update', (val) => {
      dispatch(updateCookies(val));
    });

    const removeGlobalEnvironmentsUpdatesListener = ipcRenderer.on('main:load-global-environments', (val) => {
      dispatch(updateGlobalEnvironments(val));
    });

    const removeSnapshotHydrationListener = ipcRenderer.on('main:hydrate-app-with-ui-state-snapshot', (val) => {
      dispatch(hydrateCollectionWithUiStateSnapshot(val));
    });

    const removeCollectionOauth2CredentialsUpdatesListener = ipcRenderer.on('main:credentials-update', (val) => {
      const payload = {
        ...val,
        itemUid: val.itemUid || null,
        folderUid: val.folderUid || null,
        credentialsId: val.credentialsId || 'credentials'
      };
      dispatch(collectionAddOauth2CredentialsByUrl(payload));
    });

    const removeCollectionOauth2CredentialsClearListener = ipcRenderer.on('main:credentials-clear', (val) => {
      dispatch(collectionClearOauth2CredentialsByCredentialsId(val));
    });

    const removeHttpStreamNewDataListener = ipcRenderer.on('main:http-stream-new-data', (val) => {
      dispatch(streamDataReceived(val));
    });

    const removeHttpStreamEndListener = ipcRenderer.on('main:http-stream-end', (val) => {
      dispatch(requestCancelled(val));
    });

    const removeCollectionLoadingStateListener = ipcRenderer.on('main:collection-loading-state-updated', (val) => {
      dispatch(updateCollectionLoadingState(val));
    });

    const gitVersionListener = ipcRenderer.on('main:git-version', (val) => {
      dispatch(setGitVersion(val));
    });

    return () => {
      clearSessionRestoreState();
      removeCollectionTreeUpdateListener();
      removeApiSpecTreeUpdateListener();
      removeOpenCollectionListener();
      removeWorkspacesReadyListener();
      removeOpenWorkspaceListener();
      removeWorkspaceConfigUpdatedListener();
      removeWorkspaceEnvironmentAddedListener();
      removeWorkspaceEnvironmentChangedListener();
      removeWorkspaceEnvironmentDeletedListener();
      removeDisplayErrorListener();
      removeScriptEnvUpdateListener();
      removeGlobalEnvironmentVariablesUpdateListener();
      removeCollectionRenamedListener();
      removeRunFolderEventListener();
      removeRunRequestEventListener();
      removeProcessEnvUpdatesListener();
      removeWorkspaceDotEnvUpdatesListener();
      removeDotEnvFileUpdateListener();
      removeConsoleLogListener();
      removeConfigUpdatesListener();
      removeShowPreferencesListener();
      removePreferencesUpdatesListener();
      removeCookieUpdateListener();
      removeGlobalEnvironmentsUpdatesListener();
      removeSnapshotHydrationListener();
      removeCollectionOauth2CredentialsUpdatesListener();
      removeCollectionOauth2CredentialsClearListener();
      removeHttpStreamNewDataListener();
      removeHttpStreamEndListener();
      removeCollectionLoadingStateListener();
      removePersistentEnvVariablesUpdateListener();
      removeSystemResourcesListener();
      gitVersionListener();
    };
  }, [isElectron]);
};

export default useIpcEvents;
