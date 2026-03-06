/**
 * i18n — Système de traduction pour TempoMatcher
 * Langues supportées : fr | en | de | es
 */
const i18n = (() => {

  const AVAILABLE   = ['fr', 'en', 'de', 'es'];
  const LANG_LABELS = { fr: 'FR', en: 'EN', de: 'DE', es: 'ES' };

  let _lang = localStorage.getItem('tm_lang') || 'en';
  if (!AVAILABLE.includes(_lang)) _lang = 'fr';

  /* ══════════════════════════════════════════════════════════════════
     DICTIONNAIRES
  ═══════════════════════════════════════════════════════════════════ */
  const LANGS = {

    /* ── FRANÇAIS ───────────────────────────────────────────────── */
    fr: {
      // Header
      gh_star_title:              'Voir sur GitHub — donnez une ⭐ si vous aimez !',
      save_indicator_title:       'Données sauvegardées',
      btn_reset_song_title:       'Effacer les données sauvegardées pour ce morceau et repartir à zéro',
      no_file_loaded:             'Aucun fichier chargé',
      btn_load_title:             'Charger un fichier audio',
      settings_title:             'Options',
      settings_lang_label:        'Langue',
      btn_load:                   'Charger',
      // Drop zone
      drop_message:               'Glissez un fichier audio ici',
      drop_or_click:              'ou <strong>cliquez ici</strong> / bouton <strong>Charger</strong>',
      drop_click_title:           'Cliquer pour charger un fichier',
      // Zoom / view
      btn_auto_follow_on:         'Auto-recentrage (activer)',
      btn_auto_follow_off:        'Auto-recentrage (désactiver)',
      btn_zoom_out:               'Zoom arrière',
      btn_zoom_in:                'Zoom avant',
      btn_zoom_fit:               'Tout afficher',
      wave_resize_title:          'Glisser pour redimensionner',
      view_mode_title:            'Mode de visualisation',
      view_classic:               'Classique',
      view_spectral:              'Spectral',
      // Transport
      btn_play_title:             'Play / Pause',
      btn_stop_title:             'Stop',
      btn_loop_title:             'Lecture en boucle',
      btn_export_title:           'Exporter l\'audio',
      btn_export:                 'EXPORTER',
      btn_export_png_title:       'Exporter la vue en PNG',
      tools_label:                'OUTILS',
      tool_pan_wrap:              'Déplacer / naviguer',
      tool_pan_title:             'Outil déplacer / naviguer (H)',
      tool_brush_wrap:            'Pinceau – colorier par mesure',
      tool_brush_title:           'Outil pinceau – colorier par mesure (B)',
      tool_brush_spectral:        'Non disponible en mode Spectral',
      brush_color_title:          'Couleur du pinceau',
      // Beat grid – BPM
      tap_title:                  'Taper le tempo',
      auto_detect:                'AUTO-DÉTECT',
      auto_detect_title:          'Détecter le BPM automatiquement',
      bpm_half_title:             'Diviser le BPM par 2',
      bpm_double_title:           'Multiplier le BPM par 2',
      // Beat grid – Mesure
      timesig_title:              'MESURE',
      beats_per_measure:          'Temps par mesure',
      measures_per_loop:          'Mesures par boucle',
      loops_per_group:            'Boucles par bande colorée',
      // Beat grid – Offset
      offset_title:               'DÉCALAGE',
      offset_lock_title:          'Grille verrouillée sur un pin — déplacer le curseur pour déverrouiller',
      btn_snap_title:             'Poser un marqueur sur la tête de lecture et verrouiller la grille dessus',
      btn_snap:                   'Caler sur la tête de lecture',
      // Clic / Métronome
      click_title:                'CLIC',
      click_toggle_title:         'Activer / désactiver le clic',
      click_profile_title:        'Son du clic',
      click_defaut:               'Défaut',
      click_bois:                 'Bois',
      click_electro:              'Électro',
      click_doux:                 'Doux',
      click_cloche:               'Cloche',
      metro_preview_title:        'Écouter le clic seul',
      metro_vol_label:            'VOLUME',
      mc_loop_label:              'boucle',
      mc_measure_label:           'mesure',
      // Sections
      sections_title:             'SECTIONS',
      btn_add_section_title:      'Ajouter une section',
      empty_sections:             'Peignez ou appuyez sur + pour créer une section',
      section_pick_title:         'Prendre cette couleur et activer le pinceau',
      section_rename_title:       'Cliquer pour renommer',
      section_edit_title:         'Modifier la couleur de cette section',
      section_delete_title:       'Supprimer cette section',
      section_grip_title:         'Glisser pour réordonner',
      // Marqueurs
      markers_title:              'MARQUEURS',
      btn_add_profile_title:      'Enregistrer ce style comme nouveau profil',
      profile_title:              'Profil visuel',
      profile_defaut:             'Défaut',
      profile_nocturne:           'Nocturne',
      profile_vif:                'Vif',
      profile_pastel:             'Pastel',
      profile_mono:               'Monochrome',
      profile_custom:             'Personnalisé',
      btn_del_profile_title:      'Supprimer ce profil',
      profile_name_ph:            'Nom du profil…',
      profile_ok_title:           'Confirmer (Entrée)',
      profile_cancel_title:       'Annuler (Échap)',
      profile_reset_title:        'Réinitialiser le profil',
      height_label:               'HAUTEUR',
      reset_heights_title:        'Réinitialiser toutes les hauteurs',
      height_slider_title:        'Hauteur (double-clic = reset)',
      show_hide_title:            'Afficher / masquer',
      show_hide_wave_title:       'Afficher / masquer la forme d\'onde',
      marker_loop:                'BOUCLE',
      marker_measure:             'MESURE',
      marker_beat:                'TEMPS',
      marker_bands:               'BANDES',
      marker_wave:                'ONDE',
      canvas_start:               'DEBUT',
      canvas_end:                 'FIN',
      canvas_loop_prefix:         'B',
      canvas_measure_prefix:      'M',
      color_label:                'COULEUR',
      reset_colors_title:         'Réinitialiser toutes les couleurs',
      color_loop_title:           'Couleur boucle',
      color_measure_title:        'Couleur mesure',
      color_beat_title:           'Couleur temps',
      color_bands_title:          'Couleur des bandes de boucle',
      color_wave_title:           'Couleur de l\'onde',
      color_reset_title:          'Réinitialiser la couleur',
      opacity_label:              'OPACITÉ',
      reset_opacities_title:      'Réinitialiser toutes les opacités',
      opacity_slider_title:       'Opacité (double-clic = reset)',
      amplitude_title:            'Amplitude de la forme d\'onde (double-clic = reset)',
      volume_group:               'VOLUME',
      // Chargement
      loading_reading:            'Lecture du fichier…',
      loading_decoding:           'Décodage audio…',
      loading_bpm:                'Détection BPM…',
      // Pin popup
      pin_title:                  'MARQUEUR',
      pin_color_label:            'Couleur',
      pin_snap:                   'Caler la grille ici',
      pin_snap_unlock:            '🔒 Déverrouiller la grille',
      pin_delete:                 'Supprimer',
      // Menu contextuel règle
      delete_all_markers:         'Supprimer tous les marqueurs',
      delete_all_no_lock:         'Supprimer tous les marqueurs (sauf le verrou)',
      // Alertes / confirmations
      alert_format:               'Format non supporté. Utilisez MP3, WAV, OGG, FLAC ou AAC.',
      confirm_overwrite:          'Le profil « {0} » existe déjà. Voulez-vous l\'écraser ?',
      // Modal export
      exp_title:                  'Exporter',
      exp_section_content:        'CONTENU',
      exp_content_hint:           '— un ou plusieurs',
      exp_card_mix:               'Mixte',
      exp_card_mix_sub:           'Audio + métronome',
      exp_card_metro:             'Métronome seul',
      exp_card_metro_sub:         'Clic sans musique',
      exp_card_audio:             'Audio seul',
      exp_card_audio_sub:         'La musique au volume réglé',
      exp_section_format:         'FORMAT & OPTIONS',
      exp_tags_label:             'Tags',
      exp_section_premiere:       'MARQUEURS PREMIERE PRO',
      exp_card_xml:               'XML Premiere Pro',
      exp_card_xml_sub:           'Séquence XML avec marqueurs beat',
      exp_fps_label:              'FPS projet',
      exp_section_filename:       'NOM DU FICHIER',
      exp_name_ph:                'nom-de-base',
      exp_name_hint:              'Le suffixe et l\'extension sont ajoutés automatiquement',
      exp_section_files:          'FICHIERS GÉNÉRÉS',
      exp_empty:                  'Sélectionnez au moins un contenu',
      exp_btn_download:           'Télécharger',
      exp_btn_zip:                'Télécharger le ZIP',
      exp_btn_xml:                'Télécharger le XML',
      // Progression export
      exp_prog_render:            'Rendu en cours…',
      exp_prog_render_n:          'Rendu de {0} pistes en parallèle…',
      exp_prog_encoding:          'Encodage…',
      exp_prog_encoding_n:        'Encodage {0}/{1} ({2})…',
      exp_prog_downloading:       'Téléchargement…',
      exp_prog_dl_file:           'Téléchargement de « {0} »…',
      exp_prog_xml:               'Génération du XML…',
      exp_prog_zipping:           'Création de l\'archive ZIP…',
      exp_prog_done:              'Téléchargé ✓',
      exp_prog_done_zip:          'Archive ZIP téléchargée ✓',
      exp_prog_error:             '⚠ Erreur : {0}',
    },

    /* ── ENGLISH ─────────────────────────────────────────────────── */
    en: {
      // Header
      gh_star_title:              'View on GitHub — give a ⭐ if you like it!',
      save_indicator_title:       'Data saved',
      btn_reset_song_title:       'Clear saved data for this track and start over',
      no_file_loaded:             'No file loaded',
      btn_load_title:             'Load an audio file',
      settings_title:             'Settings',
      settings_lang_label:        'Language',
      btn_load:                   'Load',
      // Drop zone
      drop_message:               'Drop an audio file here',
      drop_or_click:              'or <strong>click here</strong> / <strong>Load</strong> button',
      drop_click_title:           'Click to load a file',
      // Zoom / view
      btn_auto_follow_on:         'Auto-scroll (enable)',
      btn_auto_follow_off:        'Auto-scroll (disable)',
      btn_zoom_out:               'Zoom out',
      btn_zoom_in:                'Zoom in',
      btn_zoom_fit:               'Show all',
      wave_resize_title:          'Drag to resize',
      view_mode_title:            'Visualization mode',
      view_classic:               'Classic',
      view_spectral:              'Spectral',
      // Transport
      btn_play_title:             'Play / Pause',
      btn_stop_title:             'Stop',
      btn_loop_title:             'Loop playback',
      btn_export_title:           'Export audio',
      btn_export:                 'EXPORT',
      btn_export_png_title:       'Export view as PNG',
      tools_label:                'TOOLS',
      tool_pan_wrap:              'Pan / Navigate',
      tool_pan_title:             'Pan / Navigate tool (H)',
      tool_brush_wrap:            'Brush – color by measure',
      tool_brush_title:           'Brush tool – color by measure (B)',
      tool_brush_spectral:        'Not available in Spectral mode',
      brush_color_title:          'Brush color',
      // Beat grid – BPM
      tap_title:                  'Tap the tempo',
      auto_detect:                'AUTO-DETECT',
      auto_detect_title:          'Detect BPM automatically',
      bpm_half_title:             'Halve the BPM',
      bpm_double_title:           'Double the BPM',
      // Beat grid – Meter
      timesig_title:              'METER',
      beats_per_measure:          'Beats per measure',
      measures_per_loop:          'Measures per loop',
      loops_per_group:            'Loops per color band',
      // Beat grid – Offset
      offset_title:               'OFFSET',
      offset_lock_title:          'Grid locked to a pin — move the cursor to unlock',
      btn_snap_title:             'Place a marker on the playhead and lock the grid to it',
      btn_snap:                   'Snap to playhead',
      // Click / Metronome
      click_title:                'CLICK',
      click_toggle_title:         'Enable / disable the click',
      click_profile_title:        'Click sound',
      click_defaut:               'Default',
      click_bois:                 'Wood',
      click_electro:              'Electro',
      click_doux:                 'Soft',
      click_cloche:               'Bell',
      metro_preview_title:        'Preview click only',
      metro_vol_label:            'VOLUME',
      mc_loop_label:              'loop',
      mc_measure_label:           'measure',
      // Sections
      sections_title:             'SECTIONS',
      btn_add_section_title:      'Add a section',
      empty_sections:             'Paint or press + to create a section',
      section_pick_title:         'Pick this color and enable the brush',
      section_rename_title:       'Click to rename',
      section_edit_title:         'Edit this section\'s color',
      section_delete_title:       'Delete this section',
      section_grip_title:         'Drag to reorder',
      // Markers
      markers_title:              'MARKERS',
      btn_add_profile_title:      'Save this style as a new profile',
      profile_title:              'Visual profile',
      profile_defaut:             'Default',
      profile_nocturne:           'Nocturne',
      profile_vif:                'Vivid',
      profile_pastel:             'Pastel',
      profile_mono:               'Monochrome',
      profile_custom:             'Custom',
      btn_del_profile_title:      'Delete this profile',
      profile_name_ph:            'Profile name…',
      profile_ok_title:           'Confirm (Enter)',
      profile_cancel_title:       'Cancel (Escape)',
      profile_reset_title:        'Reset profile',
      height_label:               'HEIGHT',
      reset_heights_title:        'Reset all heights',
      height_slider_title:        'Height (double-click = reset)',
      show_hide_title:            'Show / hide',
      show_hide_wave_title:       'Show / hide waveform',
      marker_loop:                'LOOP',
      marker_measure:             'MEASURE',
      marker_beat:                'BEAT',
      marker_bands:               'BANDS',
      marker_wave:                'WAVE',
      canvas_start:               'START',
      canvas_end:                 'END',
      canvas_loop_prefix:         'L',
      canvas_measure_prefix:      'M',
      color_label:                'COLOR',
      reset_colors_title:         'Reset all colors',
      color_loop_title:           'Loop color',
      color_measure_title:        'Measure color',
      color_beat_title:           'Beat color',
      color_bands_title:          'Loop band color',
      color_wave_title:           'Waveform color',
      color_reset_title:          'Reset color',
      opacity_label:              'OPACITY',
      reset_opacities_title:      'Reset all opacities',
      opacity_slider_title:       'Opacity (double-click = reset)',
      amplitude_title:            'Waveform amplitude (double-click = reset)',
      volume_group:               'VOLUME',
      // Loading
      loading_reading:            'Reading file…',
      loading_decoding:           'Decoding audio…',
      loading_bpm:                'Detecting BPM…',
      // Pin popup
      pin_title:                  'MARKER',
      pin_color_label:            'Color',
      pin_snap:                   'Snap grid here',
      pin_snap_unlock:            '🔒 Unlock grid',
      pin_delete:                 'Delete',
      // Ruler context menu
      delete_all_markers:         'Delete all markers',
      delete_all_no_lock:         'Delete all markers (keep lock)',
      // Alerts / confirms
      alert_format:               'Unsupported format. Please use MP3, WAV, OGG, FLAC or AAC.',
      confirm_overwrite:          'Profile "{0}" already exists. Do you want to overwrite it?',
      // Export modal
      exp_title:                  'Export',
      exp_section_content:        'CONTENT',
      exp_content_hint:           '— one or more',
      exp_card_mix:               'Mix',
      exp_card_mix_sub:           'Audio + metronome',
      exp_card_metro:             'Metronome only',
      exp_card_metro_sub:         'Click without music',
      exp_card_audio:             'Audio only',
      exp_card_audio_sub:         'Music at the set volume',
      exp_section_format:         'FORMAT & OPTIONS',
      exp_tags_label:             'Tags',
      exp_section_premiere:       'PREMIERE PRO MARKERS',
      exp_card_xml:               'XML Premiere Pro',
      exp_card_xml_sub:           'XML sequence with beat markers',
      exp_fps_label:              'Project FPS',
      exp_section_filename:       'FILE NAME',
      exp_name_ph:                'base-name',
      exp_name_hint:              'Suffix and extension are added automatically',
      exp_section_files:          'GENERATED FILES',
      exp_empty:                  'Select at least one content type',
      exp_btn_download:           'Download',
      exp_btn_zip:                'Download ZIP',
      exp_btn_xml:                'Download XML',
      // Export progress
      exp_prog_render:            'Rendering…',
      exp_prog_render_n:          'Rendering {0} tracks in parallel…',
      exp_prog_encoding:          'Encoding…',
      exp_prog_encoding_n:        'Encoding {0}/{1} ({2})…',
      exp_prog_downloading:       'Downloading…',
      exp_prog_dl_file:           'Downloading "{0}"…',
      exp_prog_xml:               'Generating XML…',
      exp_prog_zipping:           'Creating ZIP archive…',
      exp_prog_done:              'Downloaded ✓',
      exp_prog_done_zip:          'ZIP archive downloaded ✓',
      exp_prog_error:             '⚠ Error: {0}',
    },

    /* ── DEUTSCH ─────────────────────────────────────────────────── */
    de: {
      // Header
      gh_star_title:              'Auf GitHub ansehen — gib einen ⭐ wenn es dir gefällt!',
      save_indicator_title:       'Daten gespeichert',
      btn_reset_song_title:       'Gespeicherte Daten für diesen Track löschen und neu starten',
      no_file_loaded:             'Keine Datei geladen',
      btn_load_title:             'Audiodatei laden',
      settings_title:             'Einstellungen',
      settings_lang_label:        'Sprache',
      btn_load:                   'Laden',
      // Drop zone
      drop_message:               'Audiodatei hier ablegen',
      drop_or_click:              'oder <strong>hier klicken</strong> / Schaltfläche <strong>Laden</strong>',
      drop_click_title:           'Klicken um eine Datei zu laden',
      // Zoom / view
      btn_auto_follow_on:         'Auto-Scrollen (aktivieren)',
      btn_auto_follow_off:        'Auto-Scrollen (deaktivieren)',
      btn_zoom_out:               'Rauszoomen',
      btn_zoom_in:                'Reinzoomen',
      btn_zoom_fit:               'Alles anzeigen',
      wave_resize_title:          'Ziehen zum Vergrößern',
      view_mode_title:            'Visualisierungsmodus',
      view_classic:               'Klassisch',
      view_spectral:              'Spektral',
      // Transport
      btn_play_title:             'Play / Pause',
      btn_stop_title:             'Stop',
      btn_loop_title:             'Schleifenwiedergabe',
      btn_export_title:           'Audio exportieren',
      btn_export:                 'EXPORTIEREN',
      btn_export_png_title:       'Ansicht als PNG exportieren',
      tools_label:                'TOOLS',
      tool_pan_wrap:              'Verschieben / Navigieren',
      tool_pan_title:             'Verschiebe-Werkzeug (H)',
      tool_brush_wrap:            'Pinsel – Takt einfärben',
      tool_brush_title:           'Pinsel-Werkzeug – Takt einfärben (B)',
      tool_brush_spectral:        'Im Spektralmodus nicht verfügbar',
      brush_color_title:          'Pinselfarbe',
      // Beat grid – BPM
      tap_title:                  'Tempo eintippen',
      auto_detect:                'AUTO-ERKENNUNG',
      auto_detect_title:          'BPM automatisch erkennen',
      bpm_half_title:             'BPM halbieren',
      bpm_double_title:           'BPM verdoppeln',
      // Beat grid – Takt
      timesig_title:              'TAKT',
      beats_per_measure:          'Schläge pro Takt',
      measures_per_loop:          'Takte pro Schleife',
      loops_per_group:            'Schleifen pro Farbband',
      // Beat grid – Versatz
      offset_title:               'VERSATZ',
      offset_lock_title:          'Raster an Pin gesperrt — Cursor bewegen zum Entsperren',
      btn_snap_title:             'Marker auf Abspielposition setzen und Raster sperren',
      btn_snap:                   'An Abspielposition snappen',
      // Klick / Metronom
      click_title:                'KLICK',
      click_toggle_title:         'Klick ein- / ausschalten',
      click_profile_title:        'Klick-Sound',
      click_defaut:               'Standard',
      click_bois:                 'Holz',
      click_electro:              'Elektro',
      click_doux:                 'Sanft',
      click_cloche:               'Glocke',
      metro_preview_title:        'Nur Klick anhören',
      metro_vol_label:            'LAUTSTÄRKE',
      mc_loop_label:              'Schleife',
      mc_measure_label:           'Takt',
      // Sektionen
      sections_title:             'SEKTIONEN',
      btn_add_section_title:      'Abschnitt hinzufügen',
      empty_sections:             'Malen oder + drücken um einen Abschnitt zu erstellen',
      section_pick_title:         'Diese Farbe übernehmen und Pinsel aktivieren',
      section_rename_title:       'Klicken zum Umbenennen',
      section_edit_title:         'Farbe dieses Abschnitts bearbeiten',
      section_delete_title:       'Diesen Abschnitt löschen',
      section_grip_title:         'Ziehen zum Neuanordnen',
      // Marker
      markers_title:              'MARKER',
      btn_add_profile_title:      'Diesen Stil als neues Profil speichern',
      profile_title:              'Visuelles Profil',
      profile_defaut:             'Standard',
      profile_nocturne:           'Nocturne',
      profile_vif:                'Lebhaft',
      profile_pastel:             'Pastell',
      profile_mono:               'Monochrom',
      profile_custom:             'Benutzerdefiniert',
      btn_del_profile_title:      'Dieses Profil löschen',
      profile_name_ph:            'Profilname…',
      profile_ok_title:           'Bestätigen (Eingabe)',
      profile_cancel_title:       'Abbrechen (Escape)',
      profile_reset_title:        'Profil zurücksetzen',
      height_label:               'HÖHE',
      reset_heights_title:        'Alle Höhen zurücksetzen',
      height_slider_title:        'Höhe (Doppelklick = zurücksetzen)',
      show_hide_title:            'Anzeigen / ausblenden',
      show_hide_wave_title:       'Wellenform anzeigen / ausblenden',
      marker_loop:                'SCHLEIFE',
      marker_measure:             'TAKT',
      marker_beat:                'BEAT',
      marker_bands:               'BÄNDER',
      marker_wave:                'WELLE',
      canvas_start:               'ANFANG',
      canvas_end:                 'ENDE',
      canvas_loop_prefix:         'S',
      canvas_measure_prefix:      'T',
      color_label:                'FARBE',
      reset_colors_title:         'Alle Farben zurücksetzen',
      color_loop_title:           'Schleifenfarbe',
      color_measure_title:        'Taktfarbe',
      color_beat_title:           'Beat-Farbe',
      color_bands_title:          'Farbbandfarbe',
      color_wave_title:           'Wellenformfarbe',
      color_reset_title:          'Farbe zurücksetzen',
      opacity_label:              'DECKKRAFT',
      reset_opacities_title:      'Alle Deckkräfte zurücksetzen',
      opacity_slider_title:       'Deckkraft (Doppelklick = zurücksetzen)',
      amplitude_title:            'Wellenform-Amplitude (Doppelklick = zurücksetzen)',
      volume_group:               'LAUTSTÄRKE',
      // Laden
      loading_reading:            'Datei lesen…',
      loading_decoding:           'Audio dekodieren…',
      loading_bpm:                'BPM erkennen…',
      // Pin-Popup
      pin_title:                  'MARKER',
      pin_color_label:            'Farbe',
      pin_snap:                   'Raster hier einrasten',
      pin_snap_unlock:            '🔒 Raster entsperren',
      pin_delete:                 'Löschen',
      // Kontextmenü
      delete_all_markers:         'Alle Marker löschen',
      delete_all_no_lock:         'Alle Marker löschen (Sperre behalten)',
      // Alerts / Bestätigungen
      alert_format:               'Nicht unterstütztes Format. Bitte MP3, WAV, OGG, FLAC oder AAC verwenden.',
      confirm_overwrite:          'Profil „{0}" existiert bereits. Überschreiben?',
      // Export-Modal
      exp_title:                  'Exportieren',
      exp_section_content:        'INHALT',
      exp_content_hint:           '— eines oder mehrere',
      exp_card_mix:               'Mix',
      exp_card_mix_sub:           'Audio + Metronom',
      exp_card_metro:             'Nur Metronom',
      exp_card_metro_sub:         'Klick ohne Musik',
      exp_card_audio:             'Nur Audio',
      exp_card_audio_sub:         'Musik auf eingestellter Lautstärke',
      exp_section_format:         'FORMAT & OPTIONEN',
      exp_tags_label:             'Tags',
      exp_section_premiere:       'PREMIERE PRO MARKER',
      exp_card_xml:               'XML Premiere Pro',
      exp_card_xml_sub:           'XML-Sequenz mit Beat-Markern',
      exp_fps_label:              'Projekt-FPS',
      exp_section_filename:       'DATEINAME',
      exp_name_ph:                'basis-name',
      exp_name_hint:              'Suffix und Erweiterung werden automatisch hinzugefügt',
      exp_section_files:          'GENERIERTE DATEIEN',
      exp_empty:                  'Mindestens einen Inhalt auswählen',
      exp_btn_download:           'Herunterladen',
      exp_btn_zip:                'ZIP herunterladen',
      exp_btn_xml:                'XML herunterladen',
      // Export-Fortschritt
      exp_prog_render:            'Rendering…',
      exp_prog_render_n:          '{0} Spuren werden parallel gerendert…',
      exp_prog_encoding:          'Kodierung…',
      exp_prog_encoding_n:        'Kodierung {0}/{1} ({2})…',
      exp_prog_downloading:       'Herunterladen…',
      exp_prog_dl_file:           '„{0}" wird heruntergeladen…',
      exp_prog_xml:               'XML wird generiert…',
      exp_prog_zipping:           'ZIP-Archiv erstellen…',
      exp_prog_done:              'Heruntergeladen ✓',
      exp_prog_done_zip:          'ZIP-Archiv heruntergeladen ✓',
      exp_prog_error:             '⚠ Fehler: {0}',
    },

    /* ── ESPAÑOL ─────────────────────────────────────────────────── */
    es: {
      // Encabezado
      gh_star_title:              'Ver en GitHub — ¡dale una ⭐ si te gusta!',
      save_indicator_title:       'Datos guardados',
      btn_reset_song_title:       'Borrar los datos guardados de esta pista y empezar de cero',
      no_file_loaded:             'Ningún archivo cargado',
      btn_load_title:             'Cargar un archivo de audio',
      settings_title:             'Ajustes',
      settings_lang_label:        'Idioma',
      btn_load:                   'Cargar',
      // Zona de soltar
      drop_message:               'Suelta un archivo de audio aquí',
      drop_or_click:              'o <strong>haz clic aquí</strong> / botón <strong>Cargar</strong>',
      drop_click_title:           'Clic para cargar un archivo',
      // Zoom / vista
      btn_auto_follow_on:         'Desplazamiento automático (activar)',
      btn_auto_follow_off:        'Desplazamiento automático (desactivar)',
      btn_zoom_out:               'Alejar',
      btn_zoom_in:                'Acercar',
      btn_zoom_fit:               'Ver todo',
      wave_resize_title:          'Arrastrar para redimensionar',
      view_mode_title:            'Modo de visualización',
      view_classic:               'Clásico',
      view_spectral:              'Espectral',
      // Transporte
      btn_play_title:             'Play / Pausa',
      btn_stop_title:             'Detener',
      btn_loop_title:             'Reproducción en bucle',
      btn_export_title:           'Exportar audio',
      btn_export:                 'EXPORTAR',
      btn_export_png_title:       'Exportar vista como PNG',
      tools_label:                'TOOLS',
      tool_pan_wrap:              'Desplazar / Navegar',
      tool_pan_title:             'Herramienta desplazar / navegar (H)',
      tool_brush_wrap:            'Pincel – colorear por compás',
      tool_brush_title:           'Herramienta pincel – colorear por compás (B)',
      tool_brush_spectral:        'No disponible en modo Espectral',
      brush_color_title:          'Color del pincel',
      // Rejilla de beats – BPM
      tap_title:                  'Marcar el tempo',
      auto_detect:                'AUTO-DETECT',
      auto_detect_title:          'Detectar el BPM automáticamente',
      bpm_half_title:             'Dividir el BPM entre 2',
      bpm_double_title:           'Multiplicar el BPM por 2',
      // Rejilla de beats – Compás
      timesig_title:              'COMPÁS',
      beats_per_measure:          'Tiempos por compás',
      measures_per_loop:          'Compases por bucle',
      loops_per_group:            'Bucles por banda de color',
      // Rejilla de beats – Desplazamiento
      offset_title:               'DESPLAZ.',
      offset_lock_title:          'Cuadrícula anclada a un pin — mover el cursor para desbloquear',
      btn_snap_title:             'Colocar un marcador en el cursor y anclar la cuadrícula',
      btn_snap:                   'Anclar al cursor de reproducción',
      // Clic / Metrónomo
      click_title:                'CLIC',
      click_toggle_title:         'Activar / desactivar el clic',
      click_profile_title:        'Sonido del clic',
      click_defaut:               'Predeterminado',
      click_bois:                 'Madera',
      click_electro:              'Electro',
      click_doux:                 'Suave',
      click_cloche:               'Campana',
      metro_preview_title:        'Escuchar solo el clic',
      metro_vol_label:            'VOLUMEN',
      mc_loop_label:              'bucle',
      mc_measure_label:           'compás',
      // Secciones
      sections_title:             'SECCIONES',
      btn_add_section_title:      'Añadir una sección',
      empty_sections:             'Pinta o pulsa + para crear una sección',
      section_pick_title:         'Tomar este color y activar el pincel',
      section_rename_title:       'Clic para renombrar',
      section_edit_title:         'Editar el color de esta sección',
      section_delete_title:       'Eliminar esta sección',
      section_grip_title:         'Arrastrar para reordenar',
      // Marcadores
      markers_title:              'MARCADORES',
      btn_add_profile_title:      'Guardar este estilo como nuevo perfil',
      profile_title:              'Perfil visual',
      profile_defaut:             'Predeterminado',
      profile_nocturne:           'Nocturno',
      profile_vif:                'Vívido',
      profile_pastel:             'Pastel',
      profile_mono:               'Monocromo',
      profile_custom:             'Personalizado',
      btn_del_profile_title:      'Eliminar este perfil',
      profile_name_ph:            'Nombre del perfil…',
      profile_ok_title:           'Confirmar (Intro)',
      profile_cancel_title:       'Cancelar (Escape)',
      profile_reset_title:        'Restablecer perfil',
      height_label:               'ALTURA',
      reset_heights_title:        'Restablecer todas las alturas',
      height_slider_title:        'Altura (doble clic = restablecer)',
      show_hide_title:            'Mostrar / ocultar',
      show_hide_wave_title:       'Mostrar / ocultar forma de onda',
      marker_loop:                'BUCLE',
      marker_measure:             'COMPÁS',
      marker_beat:                'TIEMPO',
      marker_bands:               'BANDAS',
      marker_wave:                'ONDA',
      canvas_start:               'INICIO',
      canvas_end:                 'FIN',
      canvas_loop_prefix:         'B',
      canvas_measure_prefix:      'C',
      color_label:                'COLOR',
      reset_colors_title:         'Restablecer todos los colores',
      color_loop_title:           'Color de bucle',
      color_measure_title:        'Color de compás',
      color_beat_title:           'Color de tiempo',
      color_bands_title:          'Color de banda de bucle',
      color_wave_title:           'Color de la forma de onda',
      color_reset_title:          'Restablecer color',
      opacity_label:              'OPACIDAD',
      reset_opacities_title:      'Restablecer todas las opacidades',
      opacity_slider_title:       'Opacidad (doble clic = restablecer)',
      amplitude_title:            'Amplitud de la forma de onda (doble clic = restablecer)',
      volume_group:               'VOLUMEN',
      // Carga
      loading_reading:            'Leyendo archivo…',
      loading_decoding:           'Decodificando audio…',
      loading_bpm:                'Detectando BPM…',
      // Popup de pin
      pin_title:                  'MARCADOR',
      pin_color_label:            'Color',
      pin_snap:                   'Anclar cuadrícula aquí',
      pin_snap_unlock:            '🔒 Desbloquear cuadrícula',
      pin_delete:                 'Eliminar',
      // Menú contextual
      delete_all_markers:         'Eliminar todos los marcadores',
      delete_all_no_lock:         'Eliminar todos los marcadores (mantener anclaje)',
      // Alertas / confirmaciones
      alert_format:               'Formato no soportado. Use MP3, WAV, OGG, FLAC o AAC.',
      confirm_overwrite:          'El perfil "{0}" ya existe. ¿Desea sobreescribirlo?',
      // Modal de exportación
      exp_title:                  'Exportar',
      exp_section_content:        'CONTENIDO',
      exp_content_hint:           '— uno o más',
      exp_card_mix:               'Mezcla',
      exp_card_mix_sub:           'Audio + metrónomo',
      exp_card_metro:             'Solo metrónomo',
      exp_card_metro_sub:         'Clic sin música',
      exp_card_audio:             'Solo audio',
      exp_card_audio_sub:         'Música al volumen configurado',
      exp_section_format:         'FORMATO Y OPCIONES',
      exp_tags_label:             'Tags',
      exp_section_premiere:       'MARCADORES PREMIERE PRO',
      exp_card_xml:               'XML Premiere Pro',
      exp_card_xml_sub:           'Secuencia XML con marcadores de beat',
      exp_fps_label:              'FPS del proyecto',
      exp_section_filename:       'NOMBRE DE ARCHIVO',
      exp_name_ph:                'nombre-base',
      exp_name_hint:              'El sufijo y la extensión se añaden automáticamente',
      exp_section_files:          'ARCHIVOS GENERADOS',
      exp_empty:                  'Seleccione al menos un contenido',
      exp_btn_download:           'Descargar',
      exp_btn_zip:                'Descargar ZIP',
      exp_btn_xml:                'Descargar XML',
      // Progreso de exportación
      exp_prog_render:            'Renderizando…',
      exp_prog_render_n:          'Renderizando {0} pistas en paralelo…',
      exp_prog_encoding:          'Codificando…',
      exp_prog_encoding_n:        'Codificando {0}/{1} ({2})…',
      exp_prog_downloading:       'Descargando…',
      exp_prog_dl_file:           'Descargando "{0}"…',
      exp_prog_xml:               'Generando XML…',
      exp_prog_zipping:           'Creando archivo ZIP…',
      exp_prog_done:              'Descargado ✓',
      exp_prog_done_zip:          'Archivo ZIP descargado ✓',
      exp_prog_error:             '⚠ Error: {0}',
    },
  };

  /* ══════════════════════════════════════════════════════════════════
     FONCTIONS PRINCIPALES
  ═══════════════════════════════════════════════════════════════════ */

  /** Traduit une clé — retourne la clé elle-même si absente */
  function t(key) {
    return (LANGS[_lang] || LANGS.fr)[key] ?? LANGS.fr[key] ?? key;
  }

  /** Traduit une clé avec substitution de paramètres {0}, {1}… */
  function tf(key, ...args) {
    return t(key).replace(/\{(\d+)\}/g, (_, i) => args[+i] ?? '');
  }

  function getLang() { return _lang; }

  function setLang(lang) {
    if (!AVAILABLE.includes(lang)) return;
    _lang = lang;
    localStorage.setItem('tm_lang', lang);
    document.documentElement.lang = lang;
    _applyAll();
    _callbacks.forEach(cb => cb(lang));
  }

  /* ── Application DOM ─────────────────────────────────────────── */
  function _applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    // Mettre à jour l'état actif du sélecteur de langue
    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
  }

  /* ── Callbacks pour changement de langue ─────────────────────── */
  const _callbacks = [];
  function onLangChange(cb) { _callbacks.push(cb); }

  /* ── Initialisation du sélecteur de langue (boutons) ─────────── */
  function _initSwitcher() {
    const gearBtn = document.getElementById('btn-settings');
    const popup   = document.getElementById('settings-popup');

    if (gearBtn && popup) {
      gearBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = !popup.classList.contains('hidden');
        popup.classList.toggle('hidden', isOpen);
        gearBtn.classList.toggle('open', !isOpen);
      });
      document.addEventListener('click', e => {
        if (!popup.classList.contains('hidden') &&
            !popup.contains(e.target) && e.target !== gearBtn) {
          popup.classList.add('hidden');
          gearBtn.classList.remove('open');
        }
      });
    }

    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        if (popup) { popup.classList.add('hidden'); }
        if (gearBtn) { gearBtn.classList.remove('open'); }
      });
    });
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    document.documentElement.lang = _lang;
    _initSwitcher();
    _applyAll();
  }

  /* ── Auto-restauration au chargement ─────────────────────────── */
  // Les scripts étant en bas du <body>, le DOM est déjà prêt :
  // on applique immédiatement la langue sauvegardée (traductions +
  // classe active sur les boutons) sans attendre l'appel à init().
  document.documentElement.lang = _lang;
  _applyAll();

  return { t, tf, getLang, setLang, onLangChange, init, AVAILABLE, LANG_LABELS };
})();
