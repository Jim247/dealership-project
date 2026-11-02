<?php

/**
 * Front controller: the only PHP file the web server runs.
 *
 * Development: php -S 127.0.0.1:8000 public/index.php (or `composer serve`).
 * Passing this file as the router script sends every path through the app,
 * including ones that look like files.
 */

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Debonaire\Api\App;
use Debonaire\Api\Http\Request;

App::fromEnvironment()->handle(Request::fromGlobals())->send();
