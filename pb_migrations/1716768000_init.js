/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // -----------------------------------------------------------------------
    // scenes — encrypted collaborative drawing scenes
    // -----------------------------------------------------------------------
    const scenes = new Collection({
      id: "pbc_scenes",
      name: "scenes",
      type: "base",
      system: false,
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: null,
      indexes: [
        "CREATE UNIQUE INDEX `idx_scenes_room_id` ON `scenes` (`room_id`)",
      ],
      fields: [
        {
          id: "field_s_room_id",
          name: "room_id",
          type: "text",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: 1,
          max: 0,
          pattern: "",
          autogeneratePattern: "",
        },
        {
          id: "field_s_scene_version",
          name: "scene_version",
          type: "number",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: null,
          max: null,
          onlyInt: false,
        },
        {
          id: "field_s_ciphertext",
          name: "ciphertext",
          type: "text",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: 0,
          max: 0,
          pattern: "",
          autogeneratePattern: "",
        },
        {
          id: "field_s_iv",
          name: "iv",
          type: "text",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: 0,
          max: 0,
          pattern: "",
          autogeneratePattern: "",
        },
      ],
    });
    app.save(scenes);

    // -----------------------------------------------------------------------
    // collab_files — binary files attached to collaborative rooms
    // -----------------------------------------------------------------------
    const collabFiles = new Collection({
      id: "pbc_collab_files",
      name: "collab_files",
      type: "base",
      system: false,
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: null,
      deleteRule: null,
      indexes: [
        "CREATE UNIQUE INDEX `idx_collab_files_file_id` ON `collab_files` (`file_id`)",
      ],
      fields: [
        {
          id: "field_cf_room_id",
          name: "room_id",
          type: "text",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: 1,
          max: 0,
          pattern: "",
          autogeneratePattern: "",
        },
        {
          id: "field_cf_file_id",
          name: "file_id",
          type: "text",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          min: 1,
          max: 0,
          pattern: "",
          autogeneratePattern: "",
        },
        {
          id: "field_cf_data",
          name: "data",
          type: "file",
          system: false,
          primaryKey: false,
          required: true,
          presentable: false,
          hidden: false,
          protected: false,
          maxSelect: 1,
          maxSize: 4194304,
          mimeTypes: [],
          thumbs: [],
        },
      ],
    });
    app.save(collabFiles);
  },

  (app) => {
    for (const name of ["collab_files", "scenes"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  },
);
