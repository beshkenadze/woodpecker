/**
 * Service router and registry.
 *
 * Faithful port of `pkg/router/router.go` and `pkg/router/servicemap.go`.
 *
 * NOTE: In Go the service map is populated at package-init with all 20 services.
 * Here only the built-in `logger` service self-registers (see ./services/logger.ts),
 * so the CLI is runnable end-to-end. The full service registry is wired in the
 * integration pass, where every service self-registers via its descriptor.
 */

import type { Logger, Params, Service } from "./types.js";

/** A factory that produces a fresh, uninitialized service instance. */
export type ServiceFactory = () => Service;

/** The global service registry (port of router.serviceMap). */
const serviceMap = new Map<string, ServiceFactory>();

/** Registers a service factory under the given scheme (lowercased). */
export function registerService(scheme: string, factory: ServiceFactory): void {
  serviceMap.set(scheme.toLowerCase(), factory);
}

/** Returns the factory registered for the scheme, or undefined. */
export function getServiceFactory(scheme: string): ServiceFactory | undefined {
  return serviceMap.get(scheme.toLowerCase());
}

/** Returns the list of registered service schemes (port of ListServices). */
export function listServices(): string[] {
  return [...serviceMap.keys()];
}

/** Port of router.newService — returns a fresh uninitialized service. */
function newService(serviceScheme: string): Service {
  const factory = serviceMap.get(serviceScheme.toLowerCase());
  if (factory === undefined) {
    throw new Error(`unknown service "${serviceScheme}"`);
  }
  return factory();
}

/**
 * Extract the service scheme from a notification URL.
 * Port of ServiceRouter.ExtractServiceName.
 *
 * The scheme is the URL protocol minus the trailing ':', lowercased, with any
 * "+"-suffix (custom URL form, e.g. "service+https") stripped to its base.
 */
function extractServiceName(rawURL: string): { scheme: string; url: URL } {
  const url = new URL(rawURL);
  // URL.protocol includes the trailing ':' (e.g. "logger:").
  const protocol = url.protocol.replace(/:$/, "").toLowerCase();
  const scheme = protocol.split("+")[0] ?? protocol;
  return { scheme, url };
}

/**
 * ServiceRouter routes a message to notification services located from URLs.
 * Faithful port of router.ServiceRouter.
 */
export class ServiceRouter {
  private logger?: Logger;
  private readonly services: Service[] = [];

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /** Port of ServiceRouter.SetLogger. */
  setLogger(logger: Logger): void {
    this.logger = logger;
    for (const service of this.services) {
      service.setLogger(logger);
    }
  }

  private initService(rawURL: string): Service {
    const { scheme, url } = extractServiceName(rawURL);
    const service = newService(scheme);
    service.initialize(url, this.logger);
    return service;
  }

  /**
   * Locate returns the initialized service implementation that corresponds to
   * the given service URL. Port of ServiceRouter.Locate.
   */
  locate(rawURL: string): Service {
    return this.initService(rawURL);
  }

  /**
   * AddService initializes the specified service from its URL and adds it.
   * Port of ServiceRouter.AddService.
   */
  addService(rawURL: string): void {
    this.services.push(this.initService(rawURL));
  }

  /**
   * Send sends the message using all underlying services and returns the
   * per-service results, preserving service order. Port of ServiceRouter.Send.
   */
  async send(message: string, params?: Params): Promise<Error[]> {
    return this.sendAsync(message, params);
  }

  /**
   * SendAsync sends the message to all services concurrently and returns the
   * per-service errors in service order. A `null`-equivalent success is
   * represented by the absence of an Error (the result array index is omitted).
   *
   * Port of ServiceRouter.SendAsync: in Go each service result is delivered on
   * a channel; here we await all sends concurrently and collect the errors.
   */
  async sendAsync(message: string, params?: Params): Promise<Error[]> {
    const sendParams: Params = params ?? {};
    const results = await Promise.all(
      this.services.map(async (service): Promise<Error | null> => {
        try {
          await service.send(message, sendParams);
          return null;
        } catch (err) {
          return err instanceof Error ? err : new Error(String(err));
        }
      }),
    );
    return results.filter((err): err is Error => err !== null);
  }
}
