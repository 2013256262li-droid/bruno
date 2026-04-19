import styled from 'styled-components';

const StyledWrapper = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  .search-bar {
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    border-radius: 6px;
    border: 1px solid transparent;

    &:focus-within {
      border-color: ${(props) => props.theme.text};
      background: ${(props) => props.theme.body.bg};
    }
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.sm};

    &::placeholder {
      color: ${(props) => props.theme.colors.text.muted};
    }
  }

  .collections-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    text-align: center;
  }

  .empty-icon {
    color: ${(props) => props.theme.colors.text.muted};
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: ${(props) => props.theme.font.size.md};
    font-weight: 500;
    color: ${(props) => props.theme.text};
    margin-bottom: 6px;
  }

  .empty-description {
    font-size: ${(props) => props.theme.font.size.sm};
    color: ${(props) => props.theme.colors.text.muted};
  }

  .collections-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  .collections-title {
    font-size: ${(props) => props.theme.font.size.sm};
    font-weight: 600;
    color: ${(props) => props.theme.colors.text.muted};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .invalid-collections-warning {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 12px;
    background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    border-radius: 6px;
    border-left: 3px solid ${(props) => props.theme.colors.text.warning};
    flex-shrink: 0;
  }

  .invalid-collections-text {
    font-size: ${(props) => props.theme.font.size.sm};
    color: ${(props) => props.theme.colors.text.muted};
  }

  .cleanup-button {
    flex-shrink: 0;
    padding: 6px 12px;
    background: ${(props) => props.theme.colors.text.warning};
    color: ${(props) => props.theme.body.bg};
    border: none;
    border-radius: 4px;
    font-size: ${(props) => props.theme.font.size.xs};
    font-weight: 500;
    cursor: pointer;

    &:hover {
      opacity: 0.9;
    }
  }

  .collection-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid ${(props) => props.theme.sidebar.collection.item.hoverBg};
    cursor: pointer;

    &:last-child {
      border-bottom: none;
    }

    &.pinned {
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
      margin: 0 -12px;
      padding: 10px 12px;
      border-radius: 6px;
    }

    &.invalid {
      opacity: 0.6;
      border-left: 3px solid ${(props) => props.theme.colors.text.danger};
      padding-left: 12px;
    }

    &:hover {
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
      margin: 0 -12px;
      padding: 10px 12px;
      border-radius: 6px;

      &.pinned {
        background: ${(props) => props.theme.body.bg};
      }
    }
  }

  .collection-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pinned-indicator {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: ${(props) => props.theme.colors.text.accent};
  }

  .collection-info {
    flex: 1;
    min-width: 0;
  }

  .collection-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 1px;
  }

  .collection-name {
    font-size: ${(props) => props.theme.font.size.base};
    color: ${(props) => props.theme.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .collection-path {
    font-size: ${(props) => props.theme.font.size.xs};
    color: ${(props) => props.theme.colors.text.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .invalid-tag {
    font-size: ${(props) => props.theme.font.size.xs};
    color: ${(props) => props.theme.colors.text.danger};
    background: rgba(255, 82, 82, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .collection-menu {
    flex-shrink: 0;
    color: ${(props) => props.theme.colors.text.muted};
    cursor: pointer;

    &:hover {
      color: ${(props) => props.theme.text};
    }
  }

  .collection-dropdown {
    min-width: 140px;
  }

  .dropdown-item.pin-item {
    color: ${(props) => props.theme.colors.text.accent};
  }
`;

export default StyledWrapper;
