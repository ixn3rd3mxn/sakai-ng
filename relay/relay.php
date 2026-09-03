<?php
/**
 * NIEMS relay - forwards a small allowlist of read-only GETs to the NIEMS
 * RNIS API from a Thai IP.
 *
 * Why this exists: rnis-iqm-ptn.niems.go.th accepts connections from Thai
 * addresses only. From anywhere else the SYN is dropped silently - a connect
 * timeout, not a refusal - so the backend cannot reach it from AWS Virginia
 * or Singapore. This file runs on Thai shared hosting and is the only hop
 * that talks to NIEMS.
 *
 * Why plain PHP with no framework, no composer, no generated docs: it is one
 * endpoint with one caller, and it holds the shared token. Everything here
 * has to be readable in a single pass, because a mistake in it is a security
 * hole rather than a bug.
 *
 * Contract: the caller sends `?path=<one of ALLOWED_PATHS>` plus whatever
 * query the upstream needs, and `X-Relay-Token`. The upstream host is fixed
 * below and cannot be chosen by the caller, so this is not an open proxy.
 * The upstream's status, body and content type come back untouched - the
 * backend reads 404 as "no rows in that range", so rewriting a status would
 * change what the dashboard claims about a day.
 */

declare(strict_types=1);

/** Shared secret. Set RELAY_TOKEN in the Plesk panel, or edit this line. */
const FALLBACK_TOKEN = 'UjCjF6kOfn9Xeeco294egkk9OKnKF2fD4wyYCMN7YSU';

/** Fixed upstream. Callers send a path, never a URL. */
const UPSTREAM_ORIGIN = 'https://rnis-iqm-ptn.niems.go.th';

/** Exact paths this relay will forward. Compared literally, no prefixes. */
const ALLOWED_PATHS = [
    '/v2/summary/today',
    '/v2/agent',
    '/v2/abandon/today',
    '/v2/call-logs',
    '/v2/stats/summary/summaries',
    '/v2/stats/summary/times',
    '/v2/stats/hourly/summaries',
];

const TIMEOUT_SECONDS = 15;
const CONNECT_TIMEOUT_SECONDS = 10;

/**
 * Refuse with a JSON body. `X-Relay-Error` marks the response as the relay's
 * own rather than something the upstream said, so the caller's health check
 * can tell "my token is wrong" from "NIEMS answered 403".
 */
function refuse(int $status, string $code, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Relay-Error: ' . $code);
    echo json_encode(['error' => $code, 'message' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET') {
    header('Allow: GET');
    refuse(405, 'method_not_allowed', 'this relay forwards GET only');
}

$expected = getenv('RELAY_TOKEN');
if (!is_string($expected) || $expected === '') {
    $expected = FALLBACK_TOKEN;
}
if ($expected === '' || $expected === 'CHANGE_ME') {
    refuse(500, 'not_configured', 'relay token is not set on this host');
}

// Header, never a query string: query strings land in the access log, and a
// token sitting in a log file on shared hosting is a token that has leaked.
//
// $_SERVER is checked first and getallheaders() second because not every SAPI
// populates HTTP_* for custom headers - under CGI in particular it can be
// absent, and the failure then looks exactly like a wrong token.
$presented = $_SERVER['HTTP_X_RELAY_TOKEN'] ?? '';
if ($presented === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        if (strcasecmp($name, 'X-Relay-Token') === 0) {
            $presented = $value;
            break;
        }
    }
}
if (!is_string($presented) || !hash_equals($expected, $presented)) {
    refuse(403, 'bad_token', 'X-Relay-Token missing or incorrect');
}

$path = $_GET['path'] ?? '';
if (!is_string($path) || $path === '') {
    refuse(400, 'missing_path', 'query parameter "path" is required');
}
if (!in_array($path, ALLOWED_PATHS, true)) {
    refuse(403, 'path_not_allowed', 'that path is not on this relay\'s allowlist');
}

// Everything except `path` belongs to the upstream (branch_id, from, until,
// org_code, page, per_page, start_date, end_date, ...).
$forward = $_GET;
unset($forward['path']);
$query = http_build_query($forward);
$target = UPSTREAM_ORIGIN . $path . ($query === '' ? '' : '?' . $query);

$curl = curl_init($target);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT_SECONDS,
    CURLOPT_TIMEOUT => TIMEOUT_SECONDS,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
]);
$body = curl_exec($curl);
$errno = curl_errno($curl);
$error = curl_error($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
curl_close($curl);

if ($errno !== 0 || $body === false) {
    refuse(502, 'upstream_unreachable', 'relay could not reach NIEMS: ' . $error . ' (curl ' . $errno . ')');
}

// Verbatim from here down. The backend treats 404 as "no rows for that
// range" and 200-with-empty-data as the same thing, so the status and the
// bytes have to survive this hop unchanged.
http_response_code($status ?: 502);
header('Content-Type: ' . (is_string($contentType) && $contentType !== '' ? $contentType : 'application/json; charset=utf-8'));
echo $body;
