/**
 * Reusable context provider wrapper builders for testing.
 * Reduces boilerplate when rendering hooks/components that need context.
 */
import React from 'react';
import { ModalProvider } from '../contexts/ModalContext';
import { FilterProvider } from '../contexts/FilterContext';
import { ExpenseProvider } from '../contexts/ExpenseContext';
import { SharedDataProvider } from '../contexts/SharedDataContext';

// ── Provider Registry ──

const PROVIDERS = {
  modal: ModalProvider,
  filter: FilterProvider,
  expense: ExpenseProvider,
  sharedData: SharedDataProvider,
};

// ── Basic Wrappers ──

export const createModalWrapper = (props = {}) =>
  ({ children }) => <ModalProvider {...props}>{children}</ModalProvider>;

export const createFilterWrapper = (props = {}) =>
  ({ children }) => <FilterProvider {...props}>{children}</FilterProvider>;

export const createExpenseWrapper = (props = {}) =>
  ({ children }) => <ExpenseProvider {...props}>{children}</ExpenseProvider>;

export const createSharedDataWrapper = (props = {}) =>
  ({ children }) => <SharedDataProvider {...props}>{children}</SharedDataProvider>;

// ── Composite Wrappers ──

export const createFullContextWrapper = (props = {}) =>
  ({ children }) => (
    <FilterProvider {...(props.filter || {})}>
      <SharedDataProvider {...(props.sharedData || {})}>
        <ExpenseProvider {...(props.expense || {})}>
          <ModalProvider {...(props.modal || {})}>
            {children}
          </ModalProvider>
        </ExpenseProvider>
      </SharedDataProvider>
    </FilterProvider>
  );

export const createMinimalWrapper = (contexts = []) => {
  if (contexts.length === 0) {
    throw new Error('createMinimalWrapper requires at least one context');
  }

  return ({ children }) => {
    let element = children;
    // Wrap inside-out so first context in array is outermost
    for (let i = contexts.length - 1; i >= 0; i--) {
      const ctx = contexts[i];
      const name = typeof ctx === 'string' ? ctx : ctx.name;
      const props = typeof ctx === 'string' ? {} : (ctx.props || {});
      const Provider = PROVIDERS[name];
      element = <Provider {...props}>{element}</Provider>;
    }
    return element;
  };
};

// ── Fluent Wrapper Builder ──

export const wrapperBuilder = () => {
  const layers = [];

  const builder = {
    withModal(props = {}) {
      layers.push({ name: 'modal', props });
      return builder;
    },
    withFilter(props = {}) {
      layers.push({ name: 'filter', props });
      return builder;
    },
    withExpense(props = {}) {
      layers.push({ name: 'expense', props });
      return builder;
    },
    withSharedData(props = {}) {
      layers.push({ name: 'sharedData', props });
      return builder;
    },
    build() {
      if (layers.length === 0) {
        throw new Error('wrapperBuilder: add at least one context before calling build()');
      }
      return createMinimalWrapper(layers);
    }
  };

  return builder;
};
