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

/**
 * An in-memory `DeviceApi` fixture: real behaviour, no network, no mocking.
 *
 * It answers as a unit the backend can reach; you set `refuses` to make the
 * link fail; it records what the app asked it to send.
 */
export class FakeDeviceApi implements DeviceApi {
  /** Set before connecting to see how the UI reports a failure. */
  refuses: string | null = null;

  pushedProfileIds: number[] = [];
  selectedEqStyles: string[] = [];
  selectedLiveSimulations: string[] = [];

  private device: DeviceDto = DISCONNECTED;

  async readDevice(): Promise<DeviceDto> {
    return this.device;
  }

  async connectDevice(): Promise<DeviceDto> {
    if (this.refuses !== null) {
      this.device = { ...DISCONNECTED, problem: this.refuses };
      return this.device;
    }
    this.device = {
      connected: true,
      firmware_version: "2.02",
      serial: "ABIV002781EW",
      problem: null,
    };
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
