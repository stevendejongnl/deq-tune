import type { Locale } from "./locale.ts";

export interface UiStrings {
  factoryPresets: string;
  myProfiles: string;
  duplicate: string;
  delete: string;
  duplicateHint: string;
  selectProfilePrompt: string;
  readOnlyHint: string;
  channelFront: string;
  speakers: string;
  speakerColumn: string;
  levelColumn: string;
  timeAlignmentColumn: string;
  phaseColumn: string;
  speakerFrontLeft: string;
  speakerFrontRight: string;
  speakerRearLeft: string;
  speakerRearRight: string;
  connectDevice: string;
  connecting: string;
  usbUnsupported: string;
  connectHint: string;
  couldNotConnect: string;
  languageLabel: string;
  eqStyleTitle: string;
  liveSimulationTitle: string;
  applauseLabel: string;
  dspDeviceHint: string;
  profilesButton: string;
  closeLabel: string;
  tabEq: string;
  tabStyle: string;
}

const EN: UiStrings = {
  factoryPresets: "Factory presets",
  myProfiles: "My profiles",
  duplicate: "Duplicate",
  delete: "Delete",
  duplicateHint: "Duplicate a factory preset to start your own.",
  selectProfilePrompt: "Select a profile to see and edit its EQ.",
  readOnlyHint: "Factory preset — duplicate it in the list to edit.",
  channelFront: "Front",
  speakers: "Speakers",
  speakerColumn: "Speaker",
  levelColumn: "Level (dB)",
  timeAlignmentColumn: "Time alignment (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Front Left",
  speakerFrontRight: "Front Right",
  speakerRearLeft: "Rear Left",
  speakerRearRight: "Rear Right",
  connectDevice: "Connect DEQ device",
  connecting: "Connecting…",
  usbUnsupported: "USB connect needs Chrome or Edge",
  connectHint: "Pairing only for now — reading/writing EQ over USB isn't implemented yet.",
  couldNotConnect: "Could not connect to device",
  languageLabel: "Language",
  eqStyleTitle: "EQ Style",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applause",
  dspDeviceHint: "Takes effect once a DEQ device is connected.",
  profilesButton: "Profiles",
  closeLabel: "Close",
  tabEq: "EQ",
  tabStyle: "Style",
};

const JA: UiStrings = {
  factoryPresets: "純正プリセット",
  myProfiles: "マイプロファイル",
  duplicate: "複製",
  delete: "削除",
  duplicateHint: "純正プリセットを複製して自分用に編集できます。",
  selectProfilePrompt: "プロファイルを選ぶとEQを編集できます。",
  readOnlyHint: "純正プリセットは編集できません。複製してください。",
  channelFront: "フロント",
  speakers: "スピーカー",
  speakerColumn: "スピーカー",
  levelColumn: "レベル (dB)",
  timeAlignmentColumn: "タイムアライメント (cm)",
  phaseColumn: "位相",
  speakerFrontLeft: "フロント左",
  speakerFrontRight: "フロント右",
  speakerRearLeft: "リア左",
  speakerRearRight: "リア右",
  connectDevice: "DEQデバイスに接続",
  connecting: "接続中…",
  usbUnsupported: "USB接続にはChromeまたはEdgeが必要です",
  connectHint: "現在はペアリングのみ対応です。USB経由のEQ読み書きは未実装です。",
  couldNotConnect: "デバイスに接続できませんでした",
  languageLabel: "言語",
  eqStyleTitle: "EQスタイル",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "拍手・歓声",
  dspDeviceHint: "DEQデバイス接続後に反映されます。",
  profilesButton: "プロファイル",
  closeLabel: "閉じる",
  tabEq: "EQ",
  tabStyle: "スタイル",
};

const DE: UiStrings = {
  factoryPresets: "Werkspresets",
  myProfiles: "Meine Profile",
  duplicate: "Duplizieren",
  delete: "Löschen",
  duplicateHint: "Dupliziere ein Werkspreset, um ein eigenes zu erstellen.",
  selectProfilePrompt: "Wähle ein Profil aus, um dessen EQ zu bearbeiten.",
  readOnlyHint: "Werkspreset — zum Bearbeiten in der Liste duplizieren.",
  channelFront: "Front",
  speakers: "Lautsprecher",
  speakerColumn: "Lautsprecher",
  levelColumn: "Pegel (dB)",
  timeAlignmentColumn: "Zeitausrichtung (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Vorne links",
  speakerFrontRight: "Vorne rechts",
  speakerRearLeft: "Hinten links",
  speakerRearRight: "Hinten rechts",
  connectDevice: "DEQ-Gerät verbinden",
  connecting: "Verbindung wird hergestellt…",
  usbUnsupported: "USB-Verbindung benötigt Chrome oder Edge",
  connectHint: "Derzeit nur Kopplung — EQ per USB lesen/schreiben ist noch nicht implementiert.",
  couldNotConnect: "Verbindung zum Gerät fehlgeschlagen",
  languageLabel: "Sprache",
  eqStyleTitle: "EQ-Stil",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Beifall",
  dspDeviceHint: "Wird erst nach Verbindung mit einem DEQ-Gerät wirksam.",
  profilesButton: "Profile",
  closeLabel: "Schließen",
  tabEq: "EQ",
  tabStyle: "Stil",
};

const FR: UiStrings = {
  factoryPresets: "Préréglages d'usine",
  myProfiles: "Mes profils",
  duplicate: "Dupliquer",
  delete: "Supprimer",
  duplicateHint: "Dupliquez un préréglage d'usine pour créer le vôtre.",
  selectProfilePrompt: "Sélectionnez un profil pour modifier son EQ.",
  readOnlyHint: "Préréglage d'usine — dupliquez-le dans la liste pour l'éditer.",
  channelFront: "Avant",
  speakers: "Haut-parleurs",
  speakerColumn: "Haut-parleur",
  levelColumn: "Niveau (dB)",
  timeAlignmentColumn: "Alignement temporel (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Avant gauche",
  speakerFrontRight: "Avant droit",
  speakerRearLeft: "Arrière gauche",
  speakerRearRight: "Arrière droit",
  connectDevice: "Connecter le DEQ",
  connecting: "Connexion…",
  usbUnsupported: "La connexion USB nécessite Chrome ou Edge",
  connectHint:
    "Appairage seulement pour l'instant — lecture/écriture de l'EQ via USB pas encore implémentée.",
  couldNotConnect: "Impossible de se connecter à l'appareil",
  languageLabel: "Langue",
  eqStyleTitle: "Style EQ",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applaudissements",
  dspDeviceHint: "Prend effet une fois un appareil DEQ connecté.",
  profilesButton: "Profils",
  closeLabel: "Fermer",
  tabEq: "EQ",
  tabStyle: "Style",
};

const ES: UiStrings = {
  factoryPresets: "Preajustes de fábrica",
  myProfiles: "Mis perfiles",
  duplicate: "Duplicar",
  delete: "Eliminar",
  duplicateHint: "Duplica un preajuste de fábrica para crear el tuyo.",
  selectProfilePrompt: "Selecciona un perfil para editar su EQ.",
  readOnlyHint: "Preajuste de fábrica — duplícalo en la lista para editarlo.",
  channelFront: "Frontal",
  speakers: "Altavoces",
  speakerColumn: "Altavoz",
  levelColumn: "Nivel (dB)",
  timeAlignmentColumn: "Alineación temporal (cm)",
  phaseColumn: "Fase",
  speakerFrontLeft: "Frontal izquierdo",
  speakerFrontRight: "Frontal derecho",
  speakerRearLeft: "Trasero izquierdo",
  speakerRearRight: "Trasero derecho",
  connectDevice: "Conectar DEQ",
  connecting: "Conectando…",
  usbUnsupported: "La conexión USB necesita Chrome o Edge",
  connectHint:
    "Por ahora solo emparejamiento — leer/escribir el EQ por USB aún no está implementado.",
  couldNotConnect: "No se pudo conectar con el dispositivo",
  languageLabel: "Idioma",
  eqStyleTitle: "Estilo de EQ",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Aplausos",
  dspDeviceHint: "Se aplica al conectar un dispositivo DEQ.",
  profilesButton: "Perfiles",
  closeLabel: "Cerrar",
  tabEq: "EQ",
  tabStyle: "Estilo",
};

const NL: UiStrings = {
  factoryPresets: "Fabriekspresets",
  myProfiles: "Mijn profielen",
  duplicate: "Dupliceren",
  delete: "Verwijderen",
  duplicateHint: "Dupliceer een fabriekspreset om je eigen profiel te maken.",
  selectProfilePrompt: "Kies een profiel om de EQ ervan te bewerken.",
  readOnlyHint: "Fabriekspreset — dupliceer deze in de lijst om te bewerken.",
  channelFront: "Voor",
  speakers: "Luidsprekers",
  speakerColumn: "Luidspreker",
  levelColumn: "Niveau (dB)",
  timeAlignmentColumn: "Tijdsuitlijning (cm)",
  phaseColumn: "Fase",
  speakerFrontLeft: "Voor links",
  speakerFrontRight: "Voor rechts",
  speakerRearLeft: "Achter links",
  speakerRearRight: "Achter rechts",
  connectDevice: "DEQ-apparaat verbinden",
  connecting: "Verbinden…",
  usbUnsupported: "USB-verbinding vereist Chrome of Edge",
  connectHint: "Voorlopig alleen koppelen — EQ lezen/schrijven via USB is nog niet geïmplementeerd.",
  couldNotConnect: "Kan geen verbinding maken met het apparaat",
  languageLabel: "Taal",
  eqStyleTitle: "EQ-stijl",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applaus",
  dspDeviceHint: "Wordt actief zodra een DEQ-apparaat is verbonden.",
  profilesButton: "Profielen",
  closeLabel: "Sluiten",
  tabEq: "EQ",
  tabStyle: "Stijl",
};

const UI_STRINGS: Record<Locale, UiStrings> = { en: EN, ja: JA, de: DE, fr: FR, es: ES, nl: NL };

export function uiStrings(locale: Locale): UiStrings {
  return UI_STRINGS[locale];
}
