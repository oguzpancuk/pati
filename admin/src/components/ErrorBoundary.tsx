import { Component, type ReactNode } from 'react';

/**
 * Keeps a failing part of a page from taking the whole admin with it. React
 * unmounts the tree on an uncaught render error, so without a boundary a
 * lazy chunk that fails to load (a deploy replaced the assets, the network
 * dropped) blanks the panel and loses whatever was typed (review finding).
 */
export default class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
