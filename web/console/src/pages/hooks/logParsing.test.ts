import { describe, it, expect } from 'vitest';
import { parseLogLine } from './logParsing';

describe('parseLogLine timestamp extraction', () => {
  it('extracts an ISO timestamp with space separator', () => {
    const result = parseLogLine('2025-01-02 03:04:05 info something happened');

    expect(result.timestamp).toBe('2025-01-02 03:04:05');
  });

  it('extracts an ISO timestamp with T separator and milliseconds', () => {
    const result = parseLogLine('2025-01-02T03:04:05.123 info hi');

    expect(result.timestamp).toBe('2025-01-02T03:04:05.123');
  });

  it('extracts a timestamp wrapped in square brackets', () => {
    const result = parseLogLine('[2025-01-02 03:04:05] info hi');

    expect(result.timestamp).toBe('2025-01-02 03:04:05');
  });

  it('returns undefined timestamp when no leading date is present', () => {
    const result = parseLogLine('info just a message');

    expect(result.timestamp).toBeUndefined();
  });
});

describe('parseLogLine level extraction', () => {
  it('extracts the info level from a leading token', () => {
    const result = parseLogLine('info application started');

    expect(result.level).toBe('info');
  });

  it('extracts the warn level from a bracketed leading token', () => {
    const result = parseLogLine('[warn] disk almost full');

    expect(result.level).toBe('warn');
  });

  it('normalizes the warning token to warn', () => {
    const result = parseLogLine('warning something odd');

    expect(result.level).toBe('warn');
  });

  it('extracts the error level', () => {
    const result = parseLogLine('error connection refused');

    expect(result.level).toBe('error');
  });

  it('extracts the fatal level', () => {
    const result = parseLogLine('fatal unrecoverable failure');

    expect(result.level).toBe('fatal');
  });

  it('extracts the debug level', () => {
    const result = parseLogLine('debug verbose details');

    expect(result.level).toBe('debug');
  });

  it('extracts the trace level', () => {
    const result = parseLogLine('trace step taken');

    expect(result.level).toBe('trace');
  });

  it('infers the error level from the message when no leading level token exists', () => {
    const result = parseLogLine('2025-01-02 03:04:05 the database error occurred');

    expect(result.level).toBe('error');
  });

  it('infers the warn level from the Chinese warning marker', () => {
    const result = parseLogLine('2025-01-02 03:04:05 系统 警告 磁盘满了');

    expect(result.level).toBe('warn');
  });

  it('returns undefined level when no level token or keyword is present', () => {
    const result = parseLogLine('2025-01-02 03:04:05 nothing notable here');

    expect(result.level).toBeUndefined();
  });

  it('prefers fatal over error when both keywords are present during inference', () => {
    const result = parseLogLine('2025-01-02 03:04:05 fatal error during boot');

    expect(result.level).toBe('fatal');
  });
});

describe('parseLogLine request id extraction', () => {
  it('extracts an 8-char hex request id from a leading bracket', () => {
    const result = parseLogLine('[a1b2c3d4] info processing');

    expect(result.requestId).toBe('a1b2c3d4');
  });

  it('ignores a dashed placeholder request id', () => {
    const result = parseLogLine('[--------] info processing');

    expect(result.requestId).toBeUndefined();
  });
});

describe('parseLogLine source extraction', () => {
  it('extracts a bracketed source after the level', () => {
    const result = parseLogLine('info [auth.go:42] checking token');

    expect(result.source).toBe('auth.go:42');
  });
});

describe('parseLogLine IPv4 extraction (non-pipe)', () => {
  it('extracts a valid IPv4 address', () => {
    const result = parseLogLine('info request from 192.168.1.10 received');

    expect(result.ip).toBe('192.168.1.10');
  });

  it('returns undefined when an IPv4-looking value has an out-of-range octet', () => {
    const result = parseLogLine('info value 999.1.1.1 here');

    expect(result.ip).toBeUndefined();
  });
});

describe('parseLogLine IPv6 extraction (non-pipe)', () => {
  it('extracts a fully expanded 8-hextet IPv6 address', () => {
    const result = parseLogLine('info from 2001:0db8:0000:0000:0000:0000:0000:0001 done');

    expect(result.ip).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  it('extracts a compressed IPv6 address containing a double colon', () => {
    const result = parseLogLine('info from fe80::1 done');

    expect(result.ip).toBe('fe80::1');
  });

  it('does not treat a time-of-day string as an IPv6 address', () => {
    const result = parseLogLine('plain 12:34:56 marker');

    expect(result.ip).toBeUndefined();
  });

  it('rejects a colon-separated value that is neither compressed nor 8 hextets', () => {
    const result = parseLogLine('plain ab:cd:ef marker');

    expect(result.ip).toBeUndefined();
  });
});

describe('parseLogLine latency extraction (non-pipe)', () => {
  it('extracts a millisecond latency and strips internal whitespace', () => {
    const result = parseLogLine('info handled in 12.5 ms total');

    expect(result.latency).toBe('12.5ms');
  });

  it('extracts a microsecond latency token', () => {
    const result = parseLogLine('info took 850µs to run');

    expect(result.latency).toBe('850µs');
  });

  it('returns undefined latency when no duration token is present', () => {
    const result = parseLogLine('info no duration mentioned');

    expect(result.latency).toBeUndefined();
  });
});

describe('parseLogLine HTTP method and path extraction (non-pipe)', () => {
  it('extracts the method and the immediately following path token', () => {
    const result = parseLogLine('info GET /v1/models loaded');

    expect(result).toMatchObject({ method: 'GET', path: '/v1/models' });
  });

  it('extracts the method with no path when nothing follows it', () => {
    const result = parseLogLine('info POST');

    expect(result.method).toBe('POST');
    expect(result.path).toBeUndefined();
  });

  it('returns no method when no HTTP verb word boundary matches', () => {
    const result = parseLogLine('info forwarding the request body');

    expect(result.method).toBeUndefined();
    expect(result.path).toBeUndefined();
  });
});

describe('parseLogLine HTTP status detection (non-pipe)', () => {
  it('detects a status code from a "status:" prefix', () => {
    const result = parseLogLine('info upstream responded status: 503 retrying');

    expect(result.statusCode).toBe(503);
  });

  it('detects a status code that precedes a reason phrase', () => {
    const result = parseLogLine('info got 404 Not Found from server');

    expect(result.statusCode).toBe(404);
  });

  it('returns undefined status when no recognized status pattern matches', () => {
    const result = parseLogLine('info processed the 200 widgets in inventory');

    expect(result.statusCode).toBeUndefined();
  });
});

describe('parseLogLine pipe-delimited GIN log lines', () => {
  // The leading `[GIN]` is consumed as the `source` by LOG_SOURCE_REGEX before
  // the pipe block runs, so `source` is 'GIN' and the bracket-prefixed GIN
  // timestamp segment regex never matches the remaining `2025/01/02 - 03:04:05`.
  it('captures GIN as the source from the leading bracket', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models';

    const result = parseLogLine(line);

    expect(result.source).toBe('GIN');
  });

  it('extracts the status code from a dedicated pipe segment', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models';

    const result = parseLogLine(line);

    expect(result.statusCode).toBe(200);
  });

  it('extracts the latency from a pipe segment with whitespace stripped', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models';

    const result = parseLogLine(line);

    expect(result.latency).toBe('1.5ms');
  });

  it('extracts the IPv4 address from a pipe segment', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models';

    const result = parseLogLine(line);

    expect(result.ip).toBe('192.168.1.10');
  });

  it('extracts the method and path from a pipe segment', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models';

    const result = parseLogLine(line);

    expect(result).toMatchObject({ method: 'GET', path: '/v1/models' });
  });

  it('joins unconsumed pipe segments with a pipe separator into the message', () => {
    const line =
      '[GIN] 2025/01/02 - 03:04:05 | 200 |   1.5ms |   192.168.1.10 | GET      /v1/models | extra-note';

    const result = parseLogLine(line);

    expect(result.message).toBe('2025/01/02 - 03:04:05 | extra-note');
  });

  it('extracts the request id from a hex pipe segment', () => {
    const line = '[GIN] 2025/01/02 - 03:04:05 | a1b2c3d4 | 200 | GET /x';

    const result = parseLogLine(line);

    expect(result.requestId).toBe('a1b2c3d4');
  });

  it('does not assign a request id from a dashed pipe segment', () => {
    const line = '[GIN] 2025/01/02 - 03:04:05 | -------- | 201 | POST /y';

    const result = parseLogLine(line);

    expect(result.requestId).toBeUndefined();
  });

  it('rejects a three-digit pipe segment outside the HTTP status range', () => {
    const line = 'prefix | 099 | trailing';

    const result = parseLogLine(line);

    expect(result.statusCode).toBeUndefined();
  });
});

describe('parseLogLine GIN timestamp segment handling', () => {
  // When a pipe segment is exactly `[GIN] <timestamp>` (so the leading source
  // step did not strip the bracket), the GIN timestamp segment is consumed and
  // contributes a normalized timestamp.
  it('adopts a standalone bracketed GIN timestamp segment as the timestamp', () => {
    const result = parseLogLine('x | [GIN] 2025/01/02 - 03:04:05 | tail');

    expect(result.timestamp).toBe('2025-01-02 03:04:05');
  });

  it('consumes the standalone GIN timestamp segment so only other segments remain in the message', () => {
    const result = parseLogLine('x | [GIN] 2025/01/02 - 03:04:05 | tail');

    expect(result.message).toBe('x | tail');
  });
});

describe('parseLogLine raw passthrough and trimming', () => {
  it('preserves the original raw string untrimmed', () => {
    const result = parseLogLine('  info hello  ');

    expect(result.raw).toBe('  info hello  ');
  });

  it('returns an empty message for an empty input', () => {
    const result = parseLogLine('');

    expect(result.message).toBe('');
  });
});
