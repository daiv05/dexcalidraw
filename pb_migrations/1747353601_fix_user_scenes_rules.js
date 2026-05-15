/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("user_scenes");
    col.listRule = "@request.auth.id = user_id";
    col.viewRule = "@request.auth.id = user_id";
    col.updateRule = "@request.auth.id = user_id";
    col.deleteRule = "@request.auth.id = user_id";
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("user_scenes");
    col.listRule = "@request.auth.id != ''";
    col.viewRule = "@request.auth.id != ''";
    col.updateRule = "@request.auth.id != ''";
    col.deleteRule = "@request.auth.id != ''";
    app.save(col);
  },
);
