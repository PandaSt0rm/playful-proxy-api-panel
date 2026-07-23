let currentState;

export function resetHookState() {
  currentState = undefined;
}

export function useReducer(reducer, initialArg, init) {
  if (currentState === undefined) {
    currentState = typeof init === 'function' ? init(initialArg) : initialArg;
  }

  const dispatch = (action) => {
    currentState = reducer(currentState, action);
  };

  return [currentState, dispatch];
}

export function useCallback(callback) {
  return callback;
}

export function useMemo(factory) {
  return factory();
}

export default {
  useCallback,
  useMemo,
  useReducer,
};
