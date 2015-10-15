Ext.define('Ext.data.proxy.BreezeData', {
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

});