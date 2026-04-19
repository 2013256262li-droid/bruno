const Store = require('electron-store');
const fs = require('fs');
const path = require('path');

class UiStateSnapshotStore {
  constructor() {
    this.store = new Store({
      name: 'ui-state-snapshot',
      clearInvalidConfig: true
    });
  }

  getCollections() {
    return this.store.get('collections') || [];
  }

  saveCollections(collections) {
    this.store.set('collections', collections);
  }

  getCollectionByPathname({ pathname }) {
    let collections = this.getCollections();

    let collection = collections.find((c) => c?.pathname === pathname);
    if (!collection) {
      collection = { pathname };
      collections.push(collection);
      this.saveCollections(collections);
    }

    return collection;
  }

  setCollectionByPathname({ collection }) {
    let collections = this.getCollections();

    collections = collections.filter((c) => c?.pathname !== collection.pathname);
    collections.push({ ...collection });
    this.saveCollections(collections);

    return collection;
  }

  updateCollectionEnvironment({ collectionPath, environmentName }) {
    const collection = this.getCollectionByPathname({ pathname: collectionPath });
    collection.selectedEnvironment = environmentName;
    this.setCollectionByPathname({ collection });
  }

  update({ type, data }) {
    switch (type) {
      case 'COLLECTION_ENVIRONMENT':
        const { collectionPath, environmentName } = data;
        this.updateCollectionEnvironment({ collectionPath, environmentName });
        break;
      default:
        break;
    }
  }

  isPathValid(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') {
      return false;
    }
    try {
      const resolvedPath = path.resolve(dirPath);
      if (!fs.existsSync(resolvedPath)) {
        return false;
      }
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return false;
      }
      const brunoJsonPath = path.join(resolvedPath, 'bruno.json');
      return fs.existsSync(brunoJsonPath);
    } catch (error) {
      return false;
    }
  }

  getLastSession() {
    return this.store.get('lastSession') || null;
  }

  saveLastSession(sessionState) {
    if (!sessionState || typeof sessionState !== 'object') {
      return;
    }

    const validSession = {
      ...sessionState,
      timestamp: sessionState.timestamp || new Date().toISOString()
    };

    if (validSession.collections && Array.isArray(validSession.collections)) {
      validSession.collections = validSession.collections.filter((c) =>
        c && c.pathname && this.isPathValid(c.pathname)
      );
    }

    if (validSession.tabs && Array.isArray(validSession.tabs)) {
      const validCollectionUids = new Set(
        (validSession.collections || []).map((c) => c.uid)
      );
      validSession.tabs = validSession.tabs.filter((t) =>
        t && validCollectionUids.has(t.collectionUid)
      );
    }

    this.store.set('lastSession', validSession);
  }

  clearLastSession() {
    this.store.delete('lastSession');
  }

  getLastSessionWithValidation() {
    const session = this.getLastSession();
    if (!session) {
      return { session: null, invalidPaths: [], hasInvalidPaths: false };
    }

    const invalidPaths = [];
    const validCollections = [];
    const validCollectionUids = new Set();

    if (session.collections && Array.isArray(session.collections)) {
      for (const collection of session.collections) {
        if (!collection || !collection.pathname) {
          continue;
        }
        if (this.isPathValid(collection.pathname)) {
          validCollections.push(collection);
          validCollectionUids.add(collection.uid);
        } else {
          invalidPaths.push(collection.pathname);
        }
      }
    }

    let validTabs = session.tabs;
    if (validTabs && Array.isArray(validTabs)) {
      validTabs = validTabs.filter((t) =>
        t && validCollectionUids.has(t.collectionUid)
      );
    }

    return {
      session: {
        ...session,
        collections: validCollections,
        tabs: validTabs
      },
      invalidPaths,
      hasInvalidPaths: invalidPaths.length > 0
    };
  }
}

module.exports = UiStateSnapshotStore;
