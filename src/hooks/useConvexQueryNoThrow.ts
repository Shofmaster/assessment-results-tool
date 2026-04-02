import { useEffect, useMemo, useRef } from 'react';
import {
  useQueries,
  type OptionalRestArgsOrSkip,
  type RequestForQueries,
} from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import { convexToJson } from 'convex/values';

function parseArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (args === undefined) return {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('The arguments to a Convex function must be an object.');
  }
  return args;
}

const SINGLE_KEY = 'q' as const;

/**
 * Drop-in replacement for Convex `useQuery` that does **not** throw when the
 * server returns an error. Failed queries log once and resolve as `undefined`
 * (same shape as loading), so navigation and shared shell components keep
 * rendering instead of tripping Error Boundaries on transient failures.
 */
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): Query['_returnType'] | undefined {
  const firstArg = args[0];
  const skip = firstArg === 'skip';
  const argsObject = skip ? {} : parseArgs(firstArg as Record<string, unknown> | undefined);

  const queryReference =
    typeof query === 'string'
      ? makeFunctionReference<'query', Record<string, unknown>, unknown>(query)
      : query;

  const queryName = getFunctionName(queryReference);

  const queries = useMemo(
    () =>
      skip
        ? ({} as RequestForQueries)
        : { [SINGLE_KEY]: { query: queryReference, args: argsObject as any } },
    // Match Convex useQuery: stable identity when args are semantically equal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(convexToJson(argsObject as any)), queryName, skip],
  );

  const results = useQueries(queries);
  const result = results[SINGLE_KEY];

  const lastLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(result instanceof Error)) return;
    const key = `${queryName}:${result.message}`;
    if (lastLoggedRef.current === key) return;
    lastLoggedRef.current = key;
    console.error(`[Convex] Query failed: ${queryName}`, result);
  }, [result, queryName]);

  if (skip) return undefined;
  if (result instanceof Error) return undefined;
  return result as Query['_returnType'] | undefined;
}
