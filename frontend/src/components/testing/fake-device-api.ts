import type { DeviceApi } from "../../api/client.ts";
import type { DeviceDto, DeviceOptionsDto } from "../../dto/profile.dto.ts";

/** The two value sets the real unit offers, shortened for a test. The
 * backend reads the full lists out of the Pioneer app. */
const FAKE_OPTIONS: DeviceOptionsDto = {
  eq_styles: [
    { name: "FLAT", wire_value: 2 },
    { name: "SUPER_BASS", wire_value: 3 },
    { name: "POWERFUL", wire_value: 4 },
  ],
  live_simulations: [
    { name: "OFF", wire_value: 1 },
    { name: "CONCERT_HALL", wire_value: 2 },
    { name: "OPERA_HALL", wire_value: 6 },
  ],
};

const DISCONNECTED: DeviceDto = {
  connected: false,
  firmware_version: null,
  serial: null,
  problem: null,
};

const CONNECTED: DeviceDto = {
  connected: true,
  firmware_version: "2.02",
  serial: "ABIV002781EW",
  problem: null,
};

/**
 * An in-memory `DeviceApi` fixture: real behaviour, no network, no mocking.
 *
 * It answers as a unit the backend can reach; you set `refuses` to make the
 * link fail, or `unreachable` to make the request fail the way an
 * out-of-reach bridge does; it records what the app asked it to send.
 */
export class FakeDeviceApi implements DeviceApi {
  /** Set before connecting to see how the UI reports a failure. */
  refuses: string | null = null;

  /** Set to make every call reject, the way `fetch` does when the phone
   * is not on the bridge's network. That is a different state from a
   * bridge that answers and reports the unit as down. */
  unreachable = false;

  pushedProfileIds: number[] = [];
  selectedEqStyles: string[] = [];
  selectedLiveSimulations: string[] = [];

  private device: DeviceDto = DISCONNECTED;

  /** Starts already connected, the way a backend that connects by itself
   * looks to the app by the time it asks. */
  startConnected(): this {
    this.device = CONNECTED;
    return this;
  }

  /** Reports the unit as down, with a reason, as the backend does when it
   * reached the unit and the unit refused. */
  startWithUnitDown(problem: string): this {
    this.device = { ...DISCONNECTED, problem };
    return this;
  }

  async readDevice(): Promise<DeviceDto> {
    this.failIfUnreachable();
    return this.device;
  }

  private failIfUnreachable(): void {
    if (this.unreachable) {
      throw new TypeError("Failed to fetch");
    }
  }

  async connectDevice(): Promise<DeviceDto> {
    if (this.refuses !== null) {
      this.device = { ...DISCONNECTED, problem: this.refuses };
      return this.device;
    }
    this.device = CONNECTED;
    return this.device;
  }

  async disconnectDevice(): Promise<DeviceDto> {
    this.device = DISCONNECTED;
    return this.device;
  }

  async readDeviceOptions(): Promise<DeviceOptionsDto> {
    return FAKE_OPTIONS;
  }

  async writeTuning(profileId: number): Promise<DeviceDto> {
    this.pushedProfileIds = [...this.pushedProfileIds, profileId];
    return this.device;
  }

  async selectEqStyle(name: string): Promise<DeviceDto> {
    this.selectedEqStyles = [...this.selectedEqStyles, name];
    return this.device;
  }

  async selectLiveSimulation(name: string): Promise<DeviceDto> {
    this.selectedLiveSimulations = [...this.selectedLiveSimulations, name];
    return this.device;
  }
}
