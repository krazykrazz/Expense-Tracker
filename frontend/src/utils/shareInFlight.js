/**
 * Wrap a no-argument async loader so callers that ask while a request is already in flight share it
 * instead of sending a duplicate. Each caller gets its own copy of the JSON result, so one caller
 * mutating it can't affect another. Once the request settles the next call fetches again.
 * @param {() => Promise<any>} loader
 * @returns {() => Promise<any>}
 */
export function shareInFlight(loader) {
  let inFlight = null;
  return () => {
    if (!inFlight) {
      inFlight = loader().finally(() => { inFlight = null; });
    }
    return inFlight.then((result) => (result === undefined ? result : JSON.parse(JSON.stringify(result))));
  };
}
