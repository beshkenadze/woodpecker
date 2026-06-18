// Matrix notification service — port of Go matrix.go.

import {
  type Logger,
  type Params,
  type Service,
  Standard,
} from "@woodpecker/core";
import type { Dispatcher } from "undici";
import { MatrixClient } from "./client.js";
import { Config, Scheme } from "./config.js";

export { Scheme };

export interface MatrixServiceOptions {
  // Injectable undici dispatcher (e.g. MockAgent) for testing.
  dispatcher?: Dispatcher;
}

export class MatrixService implements Service {
  private readonly standard = new Standard();
  private config: Config | undefined;
  private client: MatrixClient | undefined;
  private logger: Logger | undefined;
  private readonly dispatcher: Dispatcher | undefined;
  private loginPromise: Promise<void> | undefined;

  constructor(options: MatrixServiceOptions = {}) {
    this.dispatcher = options.dispatcher;
  }

  setLogger(logger?: Logger): void {
    this.logger = logger;
    if (logger) {
      this.standard.setLogger(logger);
    }
  }

  // initialize parses the config URL and constructs the client. Per the SDK
  // interface this is synchronous; the network login is deferred to the first
  // send (Go performs it eagerly in Initialize, but the behavior is equivalent).
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }

    const config = new Config();
    config.setURL(configURL);
    this.config = config;

    this.client = new MatrixClient(
      config.host,
      config.disableTLS,
      this.logger,
      this.dispatcher ? { dispatcher: this.dispatcher } : {},
    );
  }

  private async ensureLoggedIn(): Promise<void> {
    if (!this.config || !this.client) {
      throw new Error("matrix service is not initialized");
    }
    if (!this.loginPromise) {
      const { user, password, deviceID } = this.config;
      const client = this.client;
      if (user !== "") {
        // Reset the cached promise on failure so a later send can retry
        // (a transient login error must not permanently brick the service).
        this.loginPromise = client
          .login(user, password, deviceID)
          .catch((err) => {
            this.loginPromise = undefined;
            throw err;
          });
      } else {
        client.useToken(password);
        this.loginPromise = Promise.resolve();
      }
    }
    await this.loginPromise;
  }

  async send(message: string, params?: Params): Promise<void> {
    if (!this.config || !this.client) {
      throw new Error("matrix service is not initialized");
    }

    // Mirror Go's Send: params are applied to a throwaway config copy (so they
    // never mutate or leak into the live config), and the message is sent to
    // the originally-configured rooms.
    this.config.cloneForParams().updateConfigFromParams(params);

    await this.ensureLoggedIn();

    const errors = await this.client.sendMessage(message, this.config.rooms);

    const [firstError] = errors;
    if (firstError) {
      for (const err of errors) {
        this.standard.logf("error sending message: %s", err.message);
      }
      throw new Error(
        `${errors.length} error(s) sending message, with initial error: ${firstError.message}`,
      );
    }
  }
}
