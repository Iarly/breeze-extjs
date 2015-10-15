/*
 * Copyright 2015 PMICT. All Rights Reserved.  
 *
 * Author: Iarly Lana Lins
 */

(function (breeze) {;breeze.ExtJSManager = function (config) {

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
};;breeze.CreateExtJSModel = function (entityType, isTreeModel) {

    /* Generate class name */
    var className = entityType.namespace +
        (isTreeModel ? '.tree.' : '.') +
        entityType.shortName;

    /* Define model config */
    var modelConfig = {
        extend: isTreeModel ? 'Ext.data.TreeModel' : 'Ext.data.Model',
        autoSync: true,
        getReferencesCount: function () {
            var raw = this.raw;
            var count = 0;
            for (var key in raw) {
                if (raw[key] instanceof Array && raw[key].length >= 1) {
                    count += raw[key].length;
                }
            }
            return count;
        },
        isAdded: function () {
            var raw = this.raw;
            return !raw || raw.entityAspect == null ? true :
                raw.entityAspect.entityState.isAdded();
        },
        constructor: function (data, context) {
            if (context && context._$typeName == "EntityManager") {
                var entity = data.entityAspect ? data : context.createEntity(entityType.shortName, data);
                this.phantom = entity.entityAspect.entityState.isAdded();
                return this.callParent([entity]);
            }
            if (data)
                this.phantom = data.Id != 'root' && (data.entityAspect == null ? true : data.entityAspect.entityState.isAdded());
            return this.callParent(arguments);
        },
        destroy: function (options) {
            options = Ext.apply({
                records: [this],
                action: 'destroy'
            }, options);

            var me = this,
                isNotPhantom = me.phantom !== true,
                scope = options.scope || me,
                stores,
                i = 0,
                storeCount,
                store,
                args,
                operation,
                callback;

            operation = new Ext.data.Operation(options);

            callback = function (operation) {
                args = [me, operation];

                // The stores property will be mutated, so clone it first
                stores = Ext.Array.clone(me.stores);
                if (operation.wasSuccessful()) {
                    for (storeCount = stores.length; i < storeCount; i++) {
                        store = stores[i];

                        // If the store has a remove it's not a TreeStore
                        if (store.remove) {
                            store.remove(me, true);
                        } else {
                            store.fireEvent('bulkremove', store, [me], [store.indexOf(me)], false);
                        }

                        if (isNotPhantom) {
                            store.fireEvent('write', store, operation);
                        }
                    }
                    me.clearListeners();
                    Ext.callback(options.success, scope, args);
                } else {
                    Ext.callback(options.failure, scope, args);
                }
                Ext.callback(options.callback, scope, args);
            };

            me.getProxy().destroy(operation, callback, me);
            return me;
        },
        fields: entityType.dataProperties ? entityType.dataProperties.map(function (property) {
            return {
                name: property.name,
                defaultValue: property.isNullable ? null : property.dataType.defaultValue,
                type: property.dataType
            };
        }) : null,
        associations: entityType.navigationProperties ? entityType.navigationProperties.map(function (nav) {
            var entityTypeNames = nav.entityTypeName.split(':#');
            var entityTypeName = entityTypeNames[1] + '.' + entityTypeNames[0];
            return {
                type: nav.isScalar ? 'hasOne' : 'hasMany',
                model: entityTypeName,
                primaryKey: entityType.keyProperties[0].name,
                foreignKey: nav.isScalar ? nav.foreignKeyNames.length > 0 ? nav.foreignKeyNames[0] : null
                    : nav.invForeignKeyNames.length > 0 ? nav.invForeignKeyNames[0] : null,
                associatedName: nav.name,
                name: nav.name
            };
        }) : null,
        idProperty: 'Id',
        proxy: {
            type: 'BreezeData',
            reader: new Ext.data.reader.Breeze({})
        }
    };

    /* Define default fields */
    modelConfig.fields = modelConfig.fields.concat([{
        name: 'leaf',
        defaultValue: true
    }, {
        name: 'text',
        convert: function (value, record) {
            return record.get("Name");
        }
    }, {
        name: 'iconCls',
        convert: function (value, data) {
            return data.iconCls ? data.iconCls : 'icon_' + entityType.shortName;
        }
    }]);

    if (decorators && decorators[entityType.shortName]) {
        decorators[entityType.shortName].decorate(modelConfig);
    }

    modelConfig.fields.push({
        name: '__isAdded',
        convert: function (value, record) {
            return record.isAdded();
        }
    });

    var classModel = Ext.define(className, modelConfig);
    classModel.prototype.entityType = entityType;
    classModel.entityType = entityType;

    return classModel;
};;Ext.override(Ext.data.association.HasOne,
{
    createSetter: function () {
        var me = this,
            foreignKey = me.foreignKey,
            instanceName = me.instanceName;

        //'this' refers to the Model instance inside this function
        return function (value, options, scope) {
            // If we were passed a record, the value to set is the key of that record.
            var setByRecord = value && value.isModel,
                valueToSet = setByRecord ? value.getId() : value;

            // Setter was passed a record.
            if (setByRecord) {
                this[instanceName] = value;
            } // Otherwise, if the key of foreign record !== passed value, delete the cached foreign record
            else if (this[instanceName] instanceof Ext.data.Model && !this.isEqual(this.get(foreignKey), valueToSet)) {
                delete this[instanceName];
            }

            // Set the forign key value
            this.set(foreignKey, valueToSet);

            if (Ext.isFunction(options)) {
                options = {
                    callback: options,
                    scope: scope || this
                };
            }
            if (this.raw.entityAspect && this.raw.entityAspect.entityManager) {
                options = options || {};
                options.entityManager = this.raw.entityAspect.entityManager;
            }
            if (Ext.isObject(options)) {
                return value.save(options);
            }
        };
    },

    createGetter: function () {
        var d = this, g = d.ownerModel, e = d.associatedName, h = d.associatedModel, c = d.foreignKey, b = d.primaryKey, a = d.instanceName;
        return function (m, n) {
            m = m || {};
            var l = this, o = l.get(c), p, j, k;

            if (m.reload === true || ((l[a] == null || l[a].raw == null) && (l.raw && l.raw[d.associatedName]))) {
                var model = null;
                var entity = l.raw[d.associatedName];

                if (entity) {
                    var entityType = Class.resolve(entity.entityType.namespace + '.' + entity.entityType.shortName);
                    model = new entityType(entity);
                    model.phantom = false;
                } else {
                    return null;
                    //model = new d.associatedModel();
                    //model.phantom = true;
                }

                // j.set(b, o);
                if (typeof m == "function") {
                    m = { callback: m, scope: n || l }
                }
                p = m.success;
                m.success = function (q) {
                    l[a] = q;
                    if (p) {
                        p.apply(this, arguments)
                    }
                };
                //h.load(o, m);
                l[a] = model;
                return model;
            } else {
                j = l[a];
                k = [j];
                n = n || m.scope || l;
                Ext.callback(m, n, k);
                Ext.callback(m.success, n, k);
                Ext.callback(m.failure, n, k);
                Ext.callback(m.callback, n, k);
                return j
            }
        }
    }
});

Ext.override(Ext.data.association.HasMany,
{
    createStore: function () {
        var h = this, j = h.associatedModel, c = h.storeName, d = h.foreignKey, a = h.primaryKey, g = h.filterProperty, b = h.autoLoad, e = h.storeConfig || {};
        return function () {
            var n = this, l, m, k = {}, o, s;
            if (n[c] === undefined) {
                o = n.get(a);
                if (g) {
                    m = { property: g, value: n.get(g), exactMatch: true }
                } else {
                    if (n.hasId(o)) {
                        m = { property: d, value: o, exactMatch: true }
                    }
                }
                if (h.orderBy) {
                    s = [];
                    var orders = h.orderBy.split(',');
                    for (var i = 0; i < orders.length; i++) {
                        s.push(orders[i]);
                    }
                }
                k[d] = n.get(a);
                /*
                 * parentModel foi inserido
                 */
                l = Ext.apply({}, e, {
                    model: j,
                    addRecords: true,
                    parentModel: n,
                    association: h,
                    filters: m ? [m] : undefined,
                    sorters: s ? s : undefined,
                    remoteFilter: false,
                    modelDefaults: k,
                    disableMetaChangeEvent: true
                });
                if (h.tree) n[c] = Stratws.data.TreeStore.create(l);
                else n[c] = Stratws.data.Store.create(l);
                if (b || (n.raw[h.associatedName] && n.raw[h.associatedName].length > 0)) {

                    var reader = h.getReader();
                    if (!reader) {
                        proxy = h.associatedModel.getProxy();

                        if (proxy) {
                            reader = proxy.getReader();
                        } else {
                            reader = new Ext.data.reader.Reader({
                                model: h.associatedName
                            });
                        }
                    }

                    if (!n[c].add) {
                        if (n[c].getRootNode() == null) {
                            n[c].setRootNode({
                                text: '',
                                leaf: false,
                                expanded: false
                            });
                        }

                        n[c].getRootNode()
                            .appendChild(reader.read(n.raw[h.associatedName]).records);
                        n[c].getRootNode().expand();
                    } else {
                        n[c].loadRecords(reader.read(n.raw[h.associatedName]).records);
                    }

                    ////n[c].load()
                    //if (n[c].add)
                    //    n[c].add(reader.read(n.raw[h.associatedName]).records);
                    //else {
                    //    n[c].root.add(reader.read(n.raw[h.associatedName]).records);
                    //}
                }
            }
            return n[c]
        }
    }
});

Ext.override(Ext.data.Model, {
    prepareAssociatedData: function (seenKeys, depth) {
        var me = this,
            associations = me.associations.items,
            associationCount = associations.length;

        for (i = 0; i < associationCount; i++) {
            association = associations[i];
            associationId = association.associationId;

            /*
             * Ao fazer isso, força ignorar as associações tree
             */
            if (association.tree) {
                seenKeys[associationId] = Infinity;
            }
        }

        return this.callParent([seenKeys, depth]);
    }
});;Ext.define('Ext.data.proxy.BreezeData', {
    extend: 'Ext.data.proxy.Server',

    alias: 'proxy.BreezeData',
    alternateClassName: ['Ext.data.BreezeData'],

    config: {
        queryable: null
    },

    doRequest: function (operation, callback, scope) {
        var me = this,
            request = this.buildRequest(operation),
            locally = operation.locally == null ? true : operation.locally;

        if (operation.action == 'create' || operation.action == 'update') {
            var entities = [];
            var records = operation.getRecords();
            for (var i = 0; i < records.length; i++) {
                if (!records[i].raw || !records[i].raw.entityAspect) {
                    if (!operation.entityManager)
                        throw new Error("Operação de criação requerido, mas entityManager não informado.");
                    var entity = operation.entityManager
                        .createEntity(records[i].entityType.shortName, records[i].data);
                    records[i].raw = entity;
                    entities.push(entity);
                } else if (records[i].raw.entityAspect && records[i].raw.entityAspect.entityState.isDetached()) {
                    if (!operation.entityManager)
                        throw new Error("Operação de reattachement requerido, mas entityManager não informado.");
                    operation.entityManager.addEntity(records[i].raw);
                }
                for (var field in records[i].data) {
                    if (records[i].raw[field] != records[i].data[field]) {
                        if (records[i].data[field] && records[i].data[field].isModel)
                            records[i].raw[field] = records[i].data[field].raw;
                        else records[i].raw[field] = records[i].data[field];
                    }
                }
                records[i].phantom = false;
            }
            if (operation.action == 'create') {
                this.processResponse(true, operation, request, entities, callback, scope);
            } else if (callback) {
                callback(operation);
            }
            return;
        }

        if (operation.action == 'destroy') {
            var records = operation.getRecords();
            for (var i = 0; i < records.length; i++) {
                if (records[i].raw && records[i].raw.entityAspect && records[i].raw.entityAspect.entityManager)
                    records[i].raw.entityAspect.setDeleted();
            }
            if (callback)
                callback(operation);
            return;
        }

        if (operation.action == 'read') {
            /*
             * Leitura realizada em um nó
             */
            if (operation.node) {
                var association = operation.node.get("children");
                if (association) {
                    association.load({
                        locally: false,
                        callback: function (response) {
                            me.processResponse(true, operation, request, response, callback, scope);
                            return;
                        }
                    });
                    return request;
                }
            }

            /*
             * Busca realizada pelo Id por um único item
             */
            var filters = operation.filters || (scope.filters ? scope.filters.items : null) || [];
            if (locally && filters.length == 1 && !filters[0].disabled && filters[0].property == 'Id') {
                var entity = scope.parentModel ? scope.parentModel.raw : null;
                var entityManager = (scope.entityManager) || (me.queryable ?
                    me.queryable.entityManager : entity ? entity.entityAspect.entityManager : null);
                var association = (entity && scope.association) ? entity[scope.association.associatedName] : null;
                var entityType = (scope.model ? scope.model.entityType : null) || (me.queryable ? me.queryable.fromEntityType
                    : association ? association.navigationProperty.entityType : null);
                if (entityManager && entityType) {
                    var entity = entityManager.getEntityByKey(entityType, filters[0].value);
                    if (entity) {
                        me.processResponse(true, operation, request, [entity], callback, scope);
                        return request;
                    }
                }
            }

            /*
             * Leitura realizada em uma association
             */
            if (!me.queryable) {
                var hasActiveFilters = false;
                for (var i = 0; i < filters.length; i++) {
                    if (!filters[i].disabled && filters[i].root != 'data') {
                        hasActiveFilters = true;
                        break;
                    }
                }

                if (scope.parentModel && scope.association) {
                    var entity = scope.parentModel.raw;
                    var association = entity[scope.association.associatedName];

                    if (!association) {
                        return me.processResponse(true, operation, request, {
                            inlineCount: 0,
                            results: []
                        }, callback, scope);
                    }

                    var entities = $.Enumerable.From(association)
                        .Where(function (entity) {
                            return entity.entityAspect.entityState.isAdded();
                        }).ToArray();

                    // 
                    var page = operation.page;
                    var start = operation.start;
                    var limit = operation.limit;

                    var parent = association.parentEntity;
                    var query = breeze.EntityQuery.fromEntityNavigation(association.parentEntity, association.navigationProperty);

                    var expands = scope.association.expands;
                    var orderBy = scope.association.orderBy;
                    var select = scope.association.select;
                    var em = parent.entityAspect.entityManager;
                    if (expands) query = query.expand(expands);
                    if (select) query = query.select(select);
                    if (orderBy) query = query.orderBy(orderBy);

                    // Verifica se o total length está possivelmente desatualizado
                    if (association.totalLength !== null && association.totalLength < association.length
                        && entities.length == 0)
                        association.totalLength = null;

                    // Se a operação ignora paginação
                    if (operation.ignorePaging) {
                        query = this.buildQueryable(operation, query, scope);
                        if (scope.association.queryFn)
                            query = scope.association.queryFn(parent, em);
                        if (scope.association.whereFn)
                            query = scope.association.whereFn(query);
                        return em.executeQuery(query, function (response) {
                            association.totalLength = response.results.length;

                            me.processResponse(true, operation, request, {
                                inlineCount: association.totalLength,
                                results: response.results
                            }, callback, scope);
                        });
                    }

                    // Assegura que o store será limpado antes de receber novos records...
                    operation.addRecords = false;

                    // Se a association já contiver dados dentro do limite...
                    if (entities.length >= start + limit) {
                        if (!association.totalLength) {
                            operation.start = 0;
                            operation.limit = 0;

                            query = this.buildQueryable(operation, query, scope);
                            if (scope.association.queryFn)
                                query = scope.association.queryFn(parent, em);
                            if (scope.association.whereFn)
                                query = scope.association.whereFn(query);

                            return em.executeQuery(query, function (response) {
                                association.totalLength = response.inlineCount;

                                me.processResponse(true, operation, request, {
                                    inlineCount: association.totalLength + entities.length,
                                    results: entities.slice(start, start + limit)
                                }, callback, scope);
                            });
                        }

                        // Retorna de uma vez os valores da association
                        me.processResponse(true, operation, request, {
                            inlineCount: association.totalLength + entities.length,
                            results: entities.slice(start, start + limit)
                        }, callback, scope);
                    }
                    else {

                        // Se não, temos que obter o restante do banco
                        operation.start = operation.start - entities.length;
                        operation.limit = operation.limit - entities.length % operation.limit;

                        query = this.buildQueryable(operation, query, scope);
                        query.queryOptions = new breeze.QueryOptions({ mergeStrategy: breeze.MergeStrategy.PreserveChanges });

                        if (scope.association.queryFn)
                            query = scope.association.queryFn(parent, em);
                        if (scope.association.whereFn)
                            query = scope.association.whereFn(query);

                        em.executeQuery(query, function (response) {
                            var local = entities.slice(start, start + limit);
                            var remote = $.Enumerable.From(response.results)
                                .Where(function (entity) {
                                    // Entidades projetadas não possuem entityAspect
                                    return (entity.entityAspect ? !entity.entityAspect.entityState.isDeleted() : true);
                                }).ToArray();
                            me.processResponse(true, operation, request, {
                                inlineCount: response.inlineCount + entities.length,
                                results: local.concat(remote)
                            }, callback, scope);
                            return;
                        }, null);

                    }
                }
                else if (operation.entityManager && scope.prototype.entityType) {
                    operation.entityManager.fetchEntityByKey(scope.prototype.entityType, operation.id, false)
                        .then(function (response) {
                            me.processResponse(true, operation, request, [response.entity], callback, scope);
                        });
                }
                return request;

            }

            return me.doRead(request, operation, callback, scope);

        }

        return request;
    },

    buildRequest: function (operation) {
        var me = this,
        // Clone params right now so that they can be mutated at any point further down the call stack
        params = operation.params = Ext.apply({}, operation.params, me.extraParams),
        request;

        //copy any sorters, filters etc into the params so they can be sent over the wire
        Ext.applyIf(params, me.getParams(operation));

        // Set up the entity id parameter according to the configured name.
        // This defaults to "id". But TreeStore has a "nodeParam" configuration which
        // specifies the id parameter name of the node being loaded.
        if (operation.id !== undefined && params[me.idParam] === undefined) {
            params[me.idParam] = operation.id;
        }

        request = new Ext.data.Request({
            params: params,
            action: operation.action,
            records: operation.records,
            operation: operation,
            // this is needed by JsonSimlet in order to properly construct responses for
            // requests from this proxy
            proxy: me
        });
        /*
         * Save the request on the Operation. Operations don't usually care about Request and Response data, but in the
         * ServerProxy and any of its subclasses we add both request and response as they may be useful for further processing
         */
        operation.request = request;

        return request;
    },

    doRead: function (request, operation, callback, scope) {
        var me = this;
        var queryable = me.buildQueryable(operation, me.getQueryable(), scope);
        var locally = null;

        if (!operation || operation.locally) {
            try {
                locally = queryable.executeLocally();
            }
            catch (e) {
                locally = null;
            }
        }

        if (!locally || locally.length == 0) {
            queryable
                .execute()
                .then(function (response) {

                    if (me.hasMapping || me.hasConvert) {
                        $.each(response.results, function (i, model) {
                            $.each(me.model.getFields(), function (j, field) {
                                if (field.mapping)
                                    model[field.name] = model[field.mapping];
                                else if (field.convert)
                                    model[field.name] = field.convert(response.results, model);
                            });
                        });
                    }

                    me.processResponse(true, operation, request, response, callback, scope);
                })
                .fail(function (response) {
                    me.processResponse(false, operation, request, response, callback, scope);
                });
        }
        else {
            me.processResponse(true, operation, request, locally, callback, scope);
        }

        return request;
    },

    buildQueryable: function (operation, queryable, scope) {
        if (!queryable)
            return queryable;

        if (operation.noTracking) {
            queryable = queryable.noTracking();
        }

        var select = operation.select;
        if (select) {
            queryable = queryable.select(select);
        }

        var predicates = operation.predicates;
        if (predicates) {
            var arrPredicated = [];
            for (var i = 0; i < predicates.length; i++) {
                arrPredicated.push(breeze.Predicate.create(predicates[i].field, predicates[i].operator || "substringof", predicates[i].value));
            }
            queryable = queryable.where(breeze.Predicate.or(arrPredicated));
        }

        var extraParams = this.extraParams;
        if (extraParams && extraParams['fields'] && extraParams['query']) {
            var fields = JSON.parse(extraParams['fields']);
            var value = extraParams['query'];
            var predicates = [];
            var numOfParameters = 0;
            var parameters = {};

            if (queryable.parameters) {
                for (var i = fields.length; i >= 0 ; i--) {
                    if (queryable.parameters[fields[i]] != undefined) {
                        parameters[fields[i]] = "'" + value + "'";
                        numOfParameters++;
                        //queryable.parameters[fields[i]] = "'" + value + "'";
                        fields.splice(i, 1);
                    }
                }

                if (numOfParameters > 0)
                    queryable = queryable.withParameters(parameters);
            }

            if (fields.length > 0) {
                for (var i = 0; i < fields.length; i++) {
                    predicates.push(breeze.Predicate.create(fields[i], "substringof", value));
                }
                queryable = queryable.where(breeze.Predicate.or(predicates));
            }
        }

        var params = operation.params;
        if (params && params.node) {
            if (queryable.parameters && params.mapping) {
                var parameters = $.extend({}, queryable.parameters);
                for (var m = 0; m < params.mapping.length; m++) {
                    var map = params.mapping[m];
                    if (queryable.parameters[map.path] !== undefined) {
                        var value = operation.node.raw[map.nodePath] + "";

                        switch (map.type) {
                            case "string":
                                parameters[map.path] = "'" + value + "'";
                                break;
                            case "guid":
                                parameters[map.path] = "guid'" + value + "'";
                                break;
                            case "number":
                            default:
                                parameters[map.path] = value;
                                break;
                        }

                    }
                }
                queryable = queryable.withParameters(parameters);
            }
            else if (params.path && params.node.value) {
                queryable = queryable.where(params.path, "Equals", params.node.value);
            }
        }

        if (queryable.parameters) {
            for (var key in queryable.parameters) {
                if (params[key] != undefined)
                    queryable.parameters[key] = params[key];
            }
        }

        var ignorePaging = operation.ignorePaging || false;
        if (params && params.unknownValues) {
            if (queryable.parameters && queryable.parameters.unknownValues) {
                var parameters = $.extend({}, queryable.parameters);
                parameters.unknownValues = params.unknownValues;
                queryable = queryable.withParameters(parameters);
                ignorePaging = true;
            }
            else {
                var predicate = null;
                params.unknownValues.split('|').forEach(function (value) {
                    if (!predicate) predicate = breeze.Predicate.create(params.valueField, "eq", value);
                    else predicate = predicate.or(breeze.Predicate.create(params.valueField, "eq", value));
                });

                if (predicate) {
                    queryable = queryable.where(predicate);
                    ignorePaging = true;
                }
            }
        }

        var filters = operation.filters || (scope.filters ? scope.filters.items : null);
        if (filters) {
            if (queryable.parametersByFilters) {
                var keys = Object.keys(queryable.parametersByFilters);
                for (var i = 0; i < keys.length; i++) {
                    queryable.parameters[keys[i]] = queryable.parametersByFilters[keys[i]];
                }
            }
            queryable.parametersByFilters = {};

            filters.forEach(function (filter) {
                if (!filter.disabled) {
                    queryable.parametersByFilters = queryable.parametersByFilters || {};
                    queryable.parametersByFilters[filter.property] = queryable.parameters[filter.property];
                    if (queryable.parameters[filter.property] !== undefined) {
                        queryable.parameters[filter.property] = filter.value;
                        if (typeof filter.value == 'string')
                            queryable.parameters[filter.property] = "'" + queryable.parameters[filter.property] + "'";
                    }
                    else if (filter.property && filter.value !== undefined) {
                        var operator = filter.operator || "Equals";
                        var parametersByFilters = queryable.parametersByFilters;
                        queryable = queryable.where(filter.property, operator, filter.value);
                        queryable.parametersByFilters = parametersByFilters;
                    }
                }
            });
        }

        var sorters = operation.sorters;
        if (sorters) {
            sorters.forEach(function (sorter) {

                var direction = sorter.direction === 'ASC' ? queryable.orderBy : queryable.orderByDesc;
                //if (sorter.getSorterFn())
                //    queryable = direction.call(queryable, sorter.getSorterFn());
                //else
                queryable = direction.call(queryable, sorter.property);

            });
        }

        ignorePaging = (scope.proxy.enablePaging != null ? !scope.proxy.enablePaging : (scope.association != null && scope.association.ignorePaging != null ?
            scope.association.ignorePaging : ignorePaging));

        if (!ignorePaging) {
            queryable = queryable.inlineCount(true);

            var pageNum = operation.page;
            var pageLimit = operation.limit;
            if (pageNum > 1)
                queryable = queryable.skip((pageNum - 1) * pageLimit);
            if ((scope.association ? scope.association.pageSize : null) || pageLimit)
                queryable = queryable.take((scope.association ? scope.association.pageSize : null) || pageLimit);
        }

        return queryable;
    },

    batch: function (options) {
        var me = this,
            useBatch = me.batchActions,
            batch,
            records,
            actions, aLen, action, a, r, rLen, record;

        var entityManager = options.entityManager;

        if (options.operations === undefined) {
            // the old-style (operations, listeners) signature was called
            // so convert to the single options argument syntax
            options = {
                operations: options,
                listeners: listeners
            };
        }

        if (options.batch) {
            if (Ext.isDefined(options.batch.runOperation)) {
                batch = Ext.applyIf(options.batch, {
                    proxy: me,
                    listeners: {}
                });
            }
        } else {
            options.batch = {
                proxy: me,
                listeners: options.listeners || {}
            };
        }

        if (!batch) {
            batch = new Ext.data.Batch(options.batch);
        }

        batch.on('complete', Ext.bind(me.onBatchComplete, me, [options], 0));

        actions = me.batchOrder.split(',');
        aLen = actions.length;

        for (a = 0; a < aLen; a++) {
            action = actions[a];
            records = options.operations[action];

            if (records) {
                if (useBatch) {
                    batch.add(new Ext.data.Operation({
                        entityManager: entityManager,
                        action: action,
                        records: records
                    }));
                } else {
                    rLen = records.length;

                    for (r = 0; r < rLen; r++) {
                        record = records[r];

                        batch.add(new Ext.data.Operation({
                            entityManager: entityManager,
                            action: action,
                            records: [record]
                        }));
                    }
                }
            }
        }

        batch.start();
        return batch;
    }

});;Ext.define("Ext.data.reader.Breeze", {
    extend: Ext.data.reader.Json,
    totalProperty: 'inlineCount',
    root: 'results',

    getData: function (d) {
        return d;
    },

    /**
     * @private
     * @method
     * Returns an accessor function for the given property string. Gives support for properties such as the following:
     *
     * - 'someProperty'
     * - 'some.property'
     * - '["someProperty"]'
     * - 'values[0]'
     * - 'someFunction()' 
     *
     * This is used by {@link #buildExtractors} to create optimized extractor functions for properties that are looked
     * up directly on the source object (e.g. {@link #successProperty}, {@link #messageProperty}, etc.).
     */
    createAccessor: (function () {
        var re = /[\[\.]/;

        return function (expr) {
            if (Ext.isEmpty(expr)) {
                return Ext.emptyFn;
            }
            if (Ext.isFunction(expr)) {
                return expr;
            }
            if (this.useSimpleAccessors !== true) {
                var i = String(expr).search(re);
                if (i >= 0) {
                    return Ext.functionFactory('obj', 'return obj' + (i > 0 ? '.' : '') + expr);
                }
            }
            return function (obj) {
                /* Makes possible define a function as a expression */
                if (expr.indexOf("()") !== -1)
                    return obj[expr.substring(0, expr.length - 2)]();
                return obj[expr];
            };
        };
    }()),

    /**
     * @private
     * @method
     * Transform breeze.js entities to extJS models 
     */
    extractData: function (data) {
        if (!data.length && Ext.isObject(data))
            data = [k];
        var models = [];
        for (var i = 0; i < data.length; i++) {
            var item = data[i];

            if (item.isModel) {
                models.push(item);
                continue;
            }

            var modelType = this.model;

            /* Search for model definition from breeze.js entityType */
            if (item.entityType && this.model.prototype.$className.indexOf(item.entityType.namespace) > -1) {
                var istree = this.model.prototype.$className.indexOf('.tree.') > -1;
                modelType = (item.entityType.namespace + (istree ? '.tree.' : '.') + item.entityType.shortName);
                models.push(Ext.create(modelType, item));
            } /* Otherwise use default model from store definition */
            else {
                var e = {};
                var model = null;
                models.push(model = new modelType(undefined, this.getId(item), item, e));
                model.phantom = false;
                this.convertRecordData(e, item, model);
            }
            //if (this.implicitIncludes && model.associations.length) {
            //    this.readAssociated(model, item);
            //}
        }
        return models;
    }
});;Ext.define("Stratws.data.Store", {
    extend: Ext.data.Store,

    constructor: function (config) {
        config = config || {};
        config.proxy = config.proxy || {
            type: 'BreezeData',
            queryable: null,
            reader: new Ext.data.reader.Breeze({})
        };
        config.autoSync = config.autoSync == null ? true : config.autoSync;
        config.remoteFilter = true;
        this.callParent([config]);
    },

    insert: function (index, records) {
        var me = this,
            sync = true,
            i, len, record,
            defaults = me.modelDefaults,
            out;

        // isIterable allows an argument list of multiple records to be passed unchanged (from add)
        if (!Ext.isIterable(records)) {
            out = records = [records];
        } else {
            out = [];
        }
        len = records.length;

        if (len) {
            for (i = 0; i < len; i++) {
                record = records[i];
                if (!record.isModel) {
                    record = me.createModel(record);
                }
                out[i] = record;
                if (defaults) {
                    record.set(defaults);
                }

                record.join(me);
                //sync = sync || record.phantom === true;
            }
            // Add records to data in one shot
            me.data.insert(index, out);

            if (me.snapshot) {
                me.snapshot.addAll(out);
            }

            if (me.requireSort) {
                // suspend events so the usual data changed events don't get fired.
                me.suspendEvents();
                me.sort();
                me.resumeEvents();
            }

            if (me.isGrouped()) {
                me.updateGroupsOnAdd(out);
            }

            me.fireEvent('add', me, out, index);
            me.fireEvent('datachanged', me);
            if (me.autoSync && sync && !me.autoSyncSuspended) {
                me.sync();
            }
        }
        return out;
    },

    sync: function (options) {
        var me = this,
            operations = {},
            toCreate = me.getNewRecords(),
            toUpdate = me.getUpdatedRecords(),
            toDestroy = me.getRemovedRecords(),
            entityManager = me.entityManager || (me.parentModel && me.parentModel.raw && me.parentModel.raw.entityAspect ?
                    me.parentModel.raw.entityAspect.entityManager : null),
            needsSync = false;

        if (toCreate.length > 0) {
            operations.create = toCreate;
            needsSync = true;
        }

        if (toUpdate.length > 0) {
            operations.update = toUpdate;
            needsSync = true;
        }

        if (toDestroy.length > 0) {
            operations.destroy = toDestroy;
            needsSync = true;
        }

        if (needsSync && me.fireEvent('beforesync', operations) !== false) {
            options = options || {};

            me.proxy.batch(Ext.apply(options, {
                entityManager: entityManager,
                operations: operations,
                listeners: me.getBatchListeners()
            }));
        }

        return me;
    },

    loadPage: function (pageNum, options) {
        pageNum = pageNum <= 0 ? 1 : pageNum;
        return this.callParent([pageNum, options]);
    },

    load: function (options) {
        var me = this;

        if (typeof options == 'function') {
            options = {
                callback: options
            };
        } else {
            options = Ext.apply({}, options);
        }

        // coloca como padrão addRecords como true...
        options.addRecords = options.addRecords == null ? true : options.addRecords;

        return me.callParent([options]);
    }

});;Ext.define("Stratws.data.TreeStore", {
    extend: Ext.data.TreeStore,

    pageSize: 25,

    currentPage: 1,

    constructor: function (config) {
        config = config || {};
        config.autoSync = true;
        config.proxy = config.proxy || {
            type: 'BreezeData',
            queryable: null,
            reader: new Ext.data.reader.Breeze({})
        };
        this.callParent([config]);
    },

    sync: function (options) {
        var me = this,
            operations = {},
            toCreate = me.getNewRecords(),
            toUpdate = me.getUpdatedRecords(),
            toDestroy = me.getRemovedRecords(),
            needsSync = false;

        if (toCreate.length > 0) {
            operations.create = toCreate;
            needsSync = true;
        }

        if (toUpdate.length > 0) {
            operations.update = toUpdate;
            needsSync = true;
        }

        if (toDestroy.length > 0) {
            operations.destroy = toDestroy;
            needsSync = true;
        }

        if (needsSync && me.fireEvent('beforesync', operations) !== false) {
            options = options || {};

            me.proxy.batch(Ext.apply(options, {
                entityManager: me.parentModel && me.parentModel.raw.entityAspect ?
                    me.parentModel.raw.entityAspect.entityManager : null,
                operations: operations,
                listeners: me.getBatchListeners()
            }));
        }

        return me;
    },

    getCount: function () {
        return this.getTotalCount();
    },

    getTotalCount: function () {
        if (!this.proxy.reader.rawData) return 0;
        this.totalCount = this.proxy.reader.getTotal(this.proxy.reader.rawData);
        return this.totalCount;
    },

    getStore: function () {
        return this;
    },

    currentPage: 1,

    clearRemovedOnLoad: true,

    clearOnPageLoad: true,

    addRecordsOptions: {
        addRecords: true
    },

    clearFilter: function () {
        return Stratws.data.Store.prototype.clearFilter.apply(this, arguments);
    },

    filter: function () {
        return Stratws.data.Store.prototype.filter.apply(this, arguments);
    },

    loadPage: function (page, options) {
        var me = this;


        me.currentPage = page;


        // Copy options into a new object so as not to mutate passed in objects
        options = Ext.apply({
            page: page,
            start: (page - 1) * me.pageSize,
            limit: me.pageSize,
            addRecords: !me.clearOnPageLoad
        }, options);


        if (me.buffered) {
            return me.loadToPrefetch(options);
        }
        me.read(options);
    },

    nextPage: function (options) {
        this.loadPage(this.currentPage + 1, options);
    },

    previousPage: function (options) {
        this.loadPage(this.currentPage - 1, options);
    },

    loadData: function (data, append) {
        var me = this,
            model = me.model,
            length = data.length,
            newData = [],
            i,
            record;


        for (i = 0; i < length; i++) {
            record = data[i];


            if (!(record.isModel)) {
                record = Ext.ModelManager.create(record, model);
            }
            newData.push(record);
        }


        me.loadRecords(newData, append ? me.addRecordsOptions : undefined);
    },

    loadRecords: function (records, options) {
        var me = this,
            i = 0,
            length = records.length,
            start,
            addRecords,
            snapshot = me.snapshot;


        if (options) {
            start = options.start;
            addRecords = options.addRecords;
        }


        if (!addRecords) {
            delete me.snapshot;
            me.clearData(true);
        } else if (snapshot) {
            snapshot.addAll(records);
        }


        me.data.addAll(records);


        if (start !== undefined) {
            for (; i < length; i++) {
                records[i].index = start + i;
                records[i].join(me);
            }
        } else {
            for (; i < length; i++) {
                records[i].join(me);
            }
        }


        /*
         * this rather inelegant suspension and resumption of events is required because both the filter and sort functions
         * fire an additional datachanged event, which is not wanted. Ideally we would do this a different way. The first
         * datachanged event is fired by the call to this.add, above.
         */
        me.suspendEvents();


        if (me.filterOnLoad && !me.remoteFilter) {
            me.filter();
        }


        if (me.sortOnLoad && !me.remoteSort) {
            me.sort(undefined, undefined, undefined, true);
        }


        me.resumeEvents();
        me.fireEvent('datachanged', me);
        me.fireEvent('refresh', me);
    },

    clearData: function (isLoad) {
        var me = this,
            records = me.data.items,
            i = records.length;


        while (i--) {
            records[i].unjoin(me);
        }
        me.data.clear();
        if (isLoad !== true || me.clearRemovedOnLoad) {
            me.removed.length = 0;
        }
    }

});;})(breeze);