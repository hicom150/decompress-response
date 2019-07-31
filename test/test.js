import http from 'http';
import zlib from 'zlib';
import test from 'ava';
import getStream from 'get-stream';
import pify from 'pify';

import {createServer} from './helpers/server';
import decompressResponse from '..';

const zlibP = pify(zlib);
const httpGetP = pify(http.get, {errorFirst: false});
const fixture = 'Compressible response content.\n';

let s;

test.before('setup', async () => {
	s = createServer();

	s.on('/', async (request, response) => {
		response.statusCode = 200;
		response.setHeader('content-type', 'text/plain');
		response.setHeader('content-encoding', 'gzip');
		response.end(await zlibP.gzip(fixture));
	});

	s.on('/deflate', async (request, response) => {
		response.statusCode = 200;
		response.setHeader('content-encoding-type', 'text/plain');
		response.setHeader('content-encoding', 'deflate');
		response.end(await zlibP.deflate(fixture));
	});

	s.on('/brotli', async (request, response) => {
		response.statusCode = 200;
		response.setHeader('content-type', 'text/plain');
		response.setHeader('content-encoding', 'br');
		response.end(await zlibP.brotliCompress(fixture));
	});

	s.on('/missing-data', async (request, response) => {
		response.statusCode = 200;
		response.setHeader('content-encoding-type', 'text/plain');
		response.setHeader('content-encoding', 'gzip');
		response.end((await zlibP.gzip(fixture)).slice(0, -1));
	});

	await s.listen(s.port);
});

test.after('cleanup', async () => {
	await s.close();
});

test('decompress gzipped content', async t => {
	const response = decompressResponse(await httpGetP(s.url));

	t.truthy(response.destroy);
	t.truthy(response.setTimeout);
	t.truthy(response.socket);
	t.truthy(response.headers);
	t.truthy(response.trailers);
	t.truthy(response.rawHeaders);
	t.truthy(response.statusCode);
	t.truthy(response.httpVersion);
	t.truthy(response.httpVersionMinor);
	t.truthy(response.httpVersionMajor);
	t.truthy(response.rawTrailers);
	t.truthy(response.statusMessage);

	response.setEncoding('utf8');

	t.is(await getStream(response), fixture);
});

test('decompress deflated content', async t => {
	const response = decompressResponse(await httpGetP(`${s.url}/deflate`));

	t.is(typeof response.httpVersion, 'string');
	t.truthy(response.headers);

	response.setEncoding('utf8');

	t.is(await getStream(response), fixture);
});

if (typeof zlib.brotliCompress === 'function') {
	test('decompress brotli content', async t => {
		const response = decompressResponse(await httpGetP(`${s.url}/brotli`));

		t.is(typeof response.httpVersion, 'string');
		t.truthy(response.headers);

		response.setEncoding('utf8');

		t.is(await getStream(response), fixture);
	});
}

test('throw error when missing data', async t => {
	const response = decompressResponse(await httpGetP(`${s.url}/missing-data`));

	t.is(typeof response.httpVersion, 'string');
	t.truthy(response.headers);

	response.setEncoding('utf8');

	const error = await t.throwsAsync(getStream(response));

	t.is(error.bufferedData, fixture);
	t.is(error.code, 'Z_BUF_ERROR');
	t.is(error.message, 'unexpected end of file');
});

test('preserves custom properties on the stream', async t => {
	let response = await httpGetP(s.url);
	response.customProp = '🦄';
	response = decompressResponse(response);

	t.is(response.customProp, '🦄');

	response.destroy();
});
