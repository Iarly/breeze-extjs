breeze.ExtJSManager = function (config) {

    /* Define default value of config */
    if (typeof config != "object") {
        var dataServiceUrl = arguments[0];
        var metadataUrl = arguments[1];
        config = {
            dataService: new breeze.DataService({
                adapterName: 'OData',
                serviceName: dataServiceUrl,
                customMetadataUrl: metadataUrl
            }),
            queryOptions: new breeze.QueryOptions({
                mergeStrategy: breeze.MergeStrategy.OverwriteChanges,
                fetchStrategy: breeze.FetchStrategy.FromServer
            }),
            validationOptions: new breeze.ValidationOptions({
                validateOnAttach: true,
                validateOnSave: true,
                validateOnQuery: false
            })
        };
    }

    /* Initialize breeze metadata store if not exists */
    var metadataStore = config.metadataStore || new breeze.MetadataStore();
    config.metadataStore = metadataStore;

    /* Define onCreateModel listener */
    metadataStore.onCreateModel = function (entityType) {
        /* Define ExtJS model for current entityType */
        breeze.CreateExtJSModel(entityType, false);
        /* Define ExtJS tree model for current entityType */
        breeze.CreateExtJSModel(entityType, true);
    };

    /* Initialize breeze entity manager */
    var entityManager = new breeze.EntityManager(config);

    entityManager.autoImportEntitiesFromSubContexts = true;

    entityManager.associateRecord = function (record) {
        record && record.save({ entityManager: this });
    };

    entityManager.entityChanged.subscribe(function (changeArgs) {
        var action = changeArgs.entityAction;
        var entity = changeArgs.entity;

        if (action == breeze.EntityAction.RejectChanges && Ext.isFunction(entity.onRejectChanges)) {
            entity.onRejectChanges();
        }
    });

    return entityManager;
};