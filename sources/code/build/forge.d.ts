/**
 * This is a file containing all of the types declarations used to determine the
 * correct type for each property in config, as well as enable autocompletition
 * for some of the text editors supporting it.
 * 
 * I put it in separate file to make `config.ts` mainly focused on Electron Forge
 * configuration.
 * 
 * @todo Reenable snap and flatpak builds when I succeed to have them working fine.
 */

// Forge types

import { ForgeConfig, ForgePlatform } from '@electron-forge/shared-types';

// Maker config types

import { MakerDebConfig } from "@electron-forge/maker-deb/dist/Config";
//import { MakerSnapConfig } from "@electron-forge/maker-snap/dist/Config";
//import { MakerFlatpakConfig } from "@electron-forge/maker-flatpak/dist/Config";
import { MakerRpmConfig } from "@electron-forge/maker-rpm/dist/Config";
import { MakerZIPConfig } from "@electron-forge/maker-zip/dist/MakerZIP";
import { MakerAppImageConfig } from "electron-forge-maker-appimage/dist/src/Config";
import { MakerDMGConfig } from "@electron-forge/maker-dmg/dist/Config";

// Publisher config types

import { PublisherGitHubConfig } from "@electron-forge/publisher-github/dist/Config"

type Redeclare<I, M> = Omit<I, keyof M> & M;

// Base types for makers / publishers

type MPConfig = unknown | {
  /** Maker or publisher specific set of options. */
  options?: unknown
}

interface MPBase {
  /** A Node.js package name that provides the maker or publisher functionality. */
  name: string,
  /** Overrides the platform that this maker or publisher will be used on.  */
  platforms?: ForgePlatform[] | null;
  /** A maker or publisher specific configuration object, usually containing the `options` property. */
  config?: MPConfig;
}

// Maker types

interface MakerAppImage extends MPBase {
  name: "electron-forge-maker-appimage",
  config?: MakerAppImageConfig
}

interface MakerDeb extends MPBase {
  name: "@electron-forge/maker-deb";
  config?: MakerDebConfig;
}

interface MakerRpm extends MPBase {
  name: "@electron-forge/maker-rpm",
  config?: MakerRpmConfig
}

/*interface MakerSnap extends MPBase {
  name: "@electron-forge/maker-snap",
  config?: MakerSnapConfig
}

interface MakerFlatpak extends MPBase {
  name: "@electron-forge/maker-flatpak",
  config?: MakerFlatpakConfig
}*/

interface MakerZIP extends MPBase {
  name: "@electron-forge/maker-zip",
  config?: MakerZIPConfig
}

interface MakerDMG extends MPBase {
  name: "@electron-forge/maker-dmg",
  config?: MakerDMGConfig
}

// Publisher types

interface PublisherGitHub extends MPBase {
  name: "@electron-forge/publisher-github",
  config?: PublisherGitHubConfig
}

// Config type

export type ForgeConfigFile = Redeclare<Partial<ForgeConfig>, {
  makers?: (
    MakerZIP | MakerAppImage | MakerDeb | MakerRpm | MakerDMG //| MakerSnap | MakerFlatpak
  )[];
  publishers?: (
    PublisherGitHub
  )[];
}>;