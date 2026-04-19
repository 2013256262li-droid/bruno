import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconBox, IconTrash, IconEdit, IconShare, IconDots, IconX, IconFolder, IconSearch, IconPin, IconPinOff, IconAlertTriangle } from '@tabler/icons';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { mountCollection, showInFolder } from 'providers/ReduxStore/slices/collections/actions';
import { getRevealInFolderLabel } from 'utils/common/platform';
import { normalizePath } from 'utils/common/path';
import toast from 'react-hot-toast';
import RenameCollection from 'components/Sidebar/Collections/Collection/RenameCollection';
import RemoveCollection from 'components/Sidebar/Collections/Collection/RemoveCollection';
import DeleteCollection from 'components/Sidebar/Collections/Collection/DeleteCollection';
import ShareCollection from 'components/ShareCollection';
import Dropdown from 'components/Dropdown';
import StyledWrapper from './StyledWrapper';

const CollectionsList = ({ workspace }) => {
  const dispatch = useDispatch();
  const { collections } = useSelector((state) => state.collections);
  const dropdownRefs = useRef({});

  const [renameCollectionModalOpen, setRenameCollectionModalOpen] = useState(false);
  const [removeCollectionModalOpen, setRemoveCollectionModalOpen] = useState(false);
  const [deleteCollectionModalOpen, setDeleteCollectionModalOpen] = useState(false);
  const [shareCollectionModalOpen, setShareCollectionModalOpen] = useState(false);
  const [selectedCollectionUid, setSelectedCollectionUid] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [invalidCollections, setInvalidCollections] = useState([]);

  useEffect(() => {
    const loadInvalidCollections = async () => {
      if (workspace?.uid) {
        try {
          const { getInvalidCollections } = await import('providers/ReduxStore/slices/workspaces/actions');
          const result = await dispatch(getInvalidCollections(workspace.uid));
          setInvalidCollections(result || []);
        } catch (error) {
          console.error('Error loading invalid collections:', error);
          setInvalidCollections([]);
        }
      }
    };
    loadInvalidCollections();
  }, [workspace?.uid, workspace?.collections, dispatch]);

  const workspaceCollections = useMemo(() => {
    if (!workspace.collections || workspace.collections.length === 0) {
      return [];
    }

    const filteredCollections = workspace.collections.filter((wc) => {
      if (workspace.scratchTempDirectory) {
        return normalizePath(wc.path) !== normalizePath(workspace.scratchTempDirectory);
      }
      return true;
    });

    const isInvalidCollection = (collectionPath) => {
      const normalizedPath = normalizePath(collectionPath);
      return invalidCollections.some((ic) => normalizePath(ic.path) === normalizedPath);
    };

    const mappedCollections = filteredCollections.map((wc) => {
      const loadedCollection = collections.find(
        (c) => normalizePath(c.pathname) === normalizePath(wc.path)
      );

      const isInvalid = isInvalidCollection(wc.path);

      if (loadedCollection) {
        return {
          ...loadedCollection,
          isGitBacked: !!wc.remote,
          gitRemoteUrl: wc.remote,
          pinned: wc.pinned,
          lastOpenedAt: wc.lastOpenedAt,
          isInvalid
        };
      }

      return {
        uid: `unloaded-${wc.path}`,
        name: wc.name,
        pathname: wc.path,
        items: [],
        environments: [],
        isGitBacked: !!wc.remote,
        isLoaded: false,
        gitRemoteUrl: wc.remote,
        git: { gitRootPath: null },
        brunoConfig: {},
        pinned: wc.pinned,
        lastOpenedAt: wc.lastOpenedAt,
        isInvalid,
        root: {
          request: {
            headers: [],
            auth: { mode: 'none' },
            vars: { req: [], res: [] },
            script: { req: '', res: '' },
            tests: ''
          },
          docs: ''
        }
      };
    });

    mappedCollections.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const timeA = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
      const timeB = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
      return timeB - timeA;
    });

    return mappedCollections;
  }, [workspace.collections, workspace.scratchTempDirectory, collections, invalidCollections]);

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) {
      return workspaceCollections;
    }

    const query = searchQuery.toLowerCase();
    return workspaceCollections.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.pathname.toLowerCase().includes(query)
    );
  }, [workspaceCollections, searchQuery]);

  const pinnedCollections = useMemo(() => filteredCollections.filter((c) => c.pinned), [filteredCollections]);
  const unpinnedCollections = useMemo(() => filteredCollections.filter((c) => !c.pinned), [filteredCollections]);

  const handleOpenCollectionClick = (collection, event) => {
    if (event.target.closest('.collection-menu')) {
      return;
    }

    if (collection.isInvalid) {
      toast.error(`Collection "${collection.name}" path is invalid. Please check if the directory exists.`);
      return;
    }

    if (collection.isLoaded === false) {
      if (collection.isGitBacked) {
        toast.error(`Collection "${collection.name}" needs to be cloned first`);
      } else {
        toast.error(`Collection "${collection.name}" does not exist on disk`);
      }
      return;
    }

    dispatch(
      mountCollection({
        collectionUid: collection.uid,
        collectionPathname: collection.pathname,
        brunoConfig: collection.brunoConfig
      })
    );

    dispatch(
      addTab({
        uid: collection.uid,
        collectionUid: collection.uid,
        type: 'collection-settings'
      })
    );

    import('providers/ReduxStore/slices/workspaces/actions').then((module) => {
      const { updateCollectionLastOpened } = module;
      dispatch(updateCollectionLastOpened(workspace.uid, collection.pathname));
    });
  };

  const handlePinCollection = async (collection, pinned) => {
    dropdownRefs.current[collection.uid]?.hide();
    try {
      const { pinCollection } = await import('providers/ReduxStore/slices/workspaces/actions');
      await dispatch(pinCollection(workspace.uid, collection.pathname, pinned));
      toast.success(pinned ? 'Collection pinned' : 'Collection unpinned');
    } catch (error) {
      console.error('Error pinning collection:', error);
      toast.error('Failed to pin collection');
    }
  };

  const handleCleanupInvalidCollections = async () => {
    try {
      const { cleanupInvalidCollections } = await import('providers/ReduxStore/slices/workspaces/actions');
      const result = await dispatch(cleanupInvalidCollections(workspace.uid));
      if (result.success) {
        toast.success(`Removed ${result.removed?.length || 0} invalid collection(s)`);
        setInvalidCollections([]);
      }
    } catch (error) {
      console.error('Error cleaning up invalid collections:', error);
      toast.error('Failed to cleanup invalid collections');
    }
  };

  const handleRenameCollection = (collection) => {
    dropdownRefs.current[collection.uid]?.hide();
    if (collection.isLoaded === false) {
      toast.error('Cannot rename collections that are not cloned yet');
      return;
    }
    setSelectedCollectionUid(collection.uid);
    setRenameCollectionModalOpen(true);
  };

  const handleShareCollection = (collection) => {
    dropdownRefs.current[collection.uid]?.hide();
    if (collection.isLoaded === false) {
      toast.error('Please clone this collection first before sharing it');
      return;
    }

    dispatch(
      mountCollection({
        collectionUid: collection.uid,
        collectionPathname: collection.pathname,
        brunoConfig: collection.brunoConfig
      })
    );

    setSelectedCollectionUid(collection.uid);
    setShareCollectionModalOpen(true);
  };

  const handleRemoveCollection = (collection) => {
    dropdownRefs.current[collection.uid]?.hide();
    if (collection.isLoaded === false && !collection.isInvalid) {
      toast.error('Cannot remove collections that are not loaded');
      return;
    }
    setSelectedCollectionUid(collection.uid);
    setRemoveCollectionModalOpen(true);
  };

  const handleDeleteCollection = (collection) => {
    dropdownRefs.current[collection.uid]?.hide();
    if (collection.isLoaded === false) {
      toast.error('Cannot delete collections that are not loaded');
      return;
    }
    setSelectedCollectionUid(collection.uid);
    setDeleteCollectionModalOpen(true);
  };

  const handleShowInFolder = (collection) => {
    dropdownRefs.current[collection.uid]?.hide();
    dispatch(showInFolder(collection.pathname)).catch((error) => {
      console.error('Error opening the folder', error);
      toast.error('Error opening the folder');
    });
  };

  const renderCollectionCard = (collection, index) => {
    const cardClasses = ['collection-card'];
    if (collection.pinned) cardClasses.push('pinned');
    if (collection.isInvalid) cardClasses.push('invalid');

    return (
      <div
        key={collection.uid || index}
        className={cardClasses.join(' ')}
        onClick={(e) => handleOpenCollectionClick(collection, e)}
      >
        {collection.pinned && (
          <div className="pinned-indicator">
            <IconPin size={14} strokeWidth={2} fill="currentColor" />
          </div>
        )}
        <div className="collection-icon-wrapper">
          <IconBox size={18} strokeWidth={1.5} />
        </div>
        <div className="collection-info">
          <div className="collection-header">
            <div className="collection-name">{collection.name}</div>
            {collection.isInvalid && <span className="invalid-tag">Invalid Path</span>}
          </div>
          <div className="collection-path">{collection.pathname}</div>
        </div>
        <div className="collection-menu">
          <Dropdown
            style="new"
            placement="bottom-end"
            onCreate={(ref) => (dropdownRefs.current[collection.uid] = ref)}
            icon={<IconDots size={18} strokeWidth={1.5} />}
          >
            <div className="collection-dropdown">
              <div
                className={`dropdown-item pin-item`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePinCollection(collection, !collection.pinned);
                }}
              >
                {collection.pinned ? (
                  <IconPinOff size={16} strokeWidth={1.5} />
                ) : (
                  <IconPin size={16} strokeWidth={1.5} />
                )}
                <span>{collection.pinned ? 'Unpin' : 'Pin'}</span>
              </div>
              {!collection.isInvalid && (
                <>
                  <div
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameCollection(collection);
                    }}
                  >
                    <IconEdit size={16} strokeWidth={1.5} />
                    <span>Rename</span>
                  </div>
                  <div
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShareCollection(collection);
                    }}
                  >
                    <IconShare size={16} strokeWidth={1.5} />
                    <span>Share</span>
                  </div>
                  <div
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowInFolder(collection);
                    }}
                  >
                    <IconFolder size={16} strokeWidth={1.5} />
                    <span>{getRevealInFolderLabel()}</span>
                  </div>
                </>
              )}
              <div
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveCollection(collection);
                }}
              >
                <IconX size={16} strokeWidth={1.5} />
                <span>Remove</span>
              </div>
              {!collection.isInvalid && (
                <div
                  className="dropdown-item delete-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCollection(collection);
                  }}
                >
                  <IconTrash size={16} strokeWidth={1.5} />
                  <span>Delete</span>
                </div>
              )}
            </div>
          </Dropdown>
        </div>
      </div>
    );
  };

  return (
    <StyledWrapper>
      {renameCollectionModalOpen && selectedCollectionUid && (
        <RenameCollection
          collectionUid={selectedCollectionUid}
          onClose={() => {
            setRenameCollectionModalOpen(false);
            setSelectedCollectionUid(null);
          }}
        />
      )}

      {removeCollectionModalOpen && selectedCollectionUid && (
        <RemoveCollection
          collectionUid={selectedCollectionUid}
          onClose={() => {
            setRemoveCollectionModalOpen(false);
            setSelectedCollectionUid(null);
          }}
        />
      )}

      {deleteCollectionModalOpen && selectedCollectionUid && (
        <DeleteCollection
          collectionUid={selectedCollectionUid}
          workspaceUid={workspace.uid}
          onClose={() => {
            setDeleteCollectionModalOpen(false);
            setSelectedCollectionUid(null);
          }}
        />
      )}

      {shareCollectionModalOpen && selectedCollectionUid && (
        <ShareCollection
          collectionUid={selectedCollectionUid}
          onClose={() => {
            setShareCollectionModalOpen(false);
            setSelectedCollectionUid(null);
          }}
        />
      )}

      {invalidCollections.length > 0 && (
        <div className="invalid-collections-warning">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconAlertTriangle size={18} strokeWidth={1.5} style={{ color: '#FF5252' }} />
            <span className="invalid-collections-text">
              {invalidCollections.length} collection{invalidCollections.length > 1 ? 's' : ''} have invalid paths
            </span>
          </div>
          <button
            className="cleanup-button"
            onClick={(e) => {
              e.stopPropagation();
              handleCleanupInvalidCollections();
            }}
          >
            Cleanup
          </button>
        </div>
      )}

      {workspaceCollections.length > 0 && (
        <div className="search-bar">
          <div className="search-input-wrapper">
            <IconSearch size={16} strokeWidth={1.5} style={{ color: '#6B7280' }} />
            <input
              type="text"
              className="search-input"
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      <div className="collections-list">
        {filteredCollections.length === 0 ? (
          <div className="empty-state">
            {searchQuery ? (
              <>
                <IconSearch size={32} strokeWidth={1.5} className="empty-icon" />
                <h3 className="empty-title">No matching collections</h3>
                <p className="empty-description">Try a different search term or clear the search.</p>
              </>
            ) : (
              <>
                <IconBox size={32} strokeWidth={1.5} className="empty-icon" />
                <h3 className="empty-title">No collections yet</h3>
                <p className="empty-description">Create your first collection or open an existing one to get started.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {pinnedCollections.length > 0 && (
              <>
                {unpinnedCollections.length > 0 && (
                  <div className="collections-header">
                    <span className="collections-title">Pinned</span>
                  </div>
                )}
                {pinnedCollections.map((collection, index) => renderCollectionCard(collection, index))}
              </>
            )}
            {unpinnedCollections.length > 0 && (
              <>
                {pinnedCollections.length > 0 && (
                  <div className="collections-header" style={{ marginTop: '8px' }}>
                    <span className="collections-title">Recent</span>
                  </div>
                )}
                {unpinnedCollections.map((collection, index) =>
                  renderCollectionCard(collection, pinnedCollections.length + index)
                )}
              </>
            )}
          </>
        )}
      </div>
    </StyledWrapper>
  );
};

export default CollectionsList;
