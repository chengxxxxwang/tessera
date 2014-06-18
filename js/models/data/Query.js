ds.models.data.Query = function(data) {
  "use strict"

  var self = limivorous.observable()
                       .property('targets')
                       .property('name')
                       .property('data')
                       .property('summation')
                       .property('options')
                       .property('expanded_targets')
                       .property('local_options')
                       .build()

  if (data) {
    if (data instanceof Array) {
      self.targets = data
    } else if (typeof(data) === 'string') {
      self.targets = [data]
    } else if (data.targets) {
      if (data.targets instanceof Array) {
        self.targets = data.targets
      } else {
        self.targets = [data.targets]
      }
    }
    if (data.options) {
      self.options = data.options
    }
    self.name = data.name
  }

  self.DEFAULT_FROM_TIME = '-3h'

  Object.defineProperty(self, 'is_query', {value: true})

  self.render_templates = function(context) {
    self.expanded_targets = self.targets.map(function(t) {
                                return ds.render_template(t, context)
                            })
  }

  self.url = function(opt) {
    var options = ds.extend(self.local_options, opt, self.options)
    var url = URI(options.base_url)
              .path('/render')
              .setQuery('format', options.format || 'png')
              .setQuery('from', options.from || self.DEFAULT_FROM_TIME)
    if (options.until) {
      url.setQuery('until', options.until)
    }
    var targets = self.expanded_targets || self.targets
    for (var i in targets) {
      url.addQuery('target', targets[i])
    }
    return url.href()
  }

  /**
   * Asynchronously load the data for this query from the graphite
   * server, notifying any listening consumers when the data is
   * available.
   *
   * @param {Object} options Parameters for generating the URL to
   * load. Valid properties are:
   *   * base_url (required)
   *   * from
   *   * until
   *   * ready
   *   * fire_only
   */
  self.load = function(opt) {
    self.local_options = ds.extend(self.local_options, opt)
    var options = ds.extend(self.local_options, opt, self.options)

    if (options.fire_only) {
      // This is a bit of a hack for optimization, to fire the query
      // events when if we don't need the raw data because we're
      // rendering non-interactive graphs only. Would like a more
      // elegant way to handle the case.
      var ready = options.ready
      if (ready && (ready instanceof Function)) {
        ready(self)
      }
      bean.fire(self, 'ds-data-ready', self)
    } else {
      options.format = 'json'
      var url = self.url(options)
      bean.fire(self, 'ds-data-loading')
      $.ajax({
        dataType: 'json',
        url: url
      })
       .done(function(response_data, textStatus) {
        self._process(response_data)
        if (options.ready && (options.ready instanceof Function)) {
          options.ready(self)
        }
        bean.fire(self, 'ds-data-ready', self)
      })
       .error(function(xhr, status, error) {
        ds.manager.error('Failed to load query ' + self.name + '. ' + error)
      })
    }
  }

  /**
   * Register an event handler to be called when the query's data is
   * loaded.
   */
  self.on_load = function(handler) {
    bean.on(self, 'ds-data-ready', handler)
  }

  /**
   * Remove all registered event handlers.
   */
  self.off = function() {
    bean.off(self, 'ds-data-ready')
  }

  /**
   * Process the results of executing the query, transforming
   * the returned structure into something consumable by the
   * charting library, and calculating sums.
   */
  self._process = function(response_data) {
    self.summation = ds.models.data.Summation()
    self.data = response_data.map(function(series) {
                  series.summation = ds.models.data.Summation(series).toJSON()
                  self.summation.merge(series.summation)
                  return series
                })
    return self
  }

  self.chart_data = function(type) {
    var attribute = 'chart_data_' + type
    if (typeof(self[attribute]) === 'undefined') {
      self[attribute] = ds.charts.process_data(self.data, type)
    }
    return self[attribute]
  }

  self.toJSON = function() {
    var json = {}
    if (self.name)
      json.name = self.name
    if (self.targets)
      json.targets = self.targets
    if (self.data)
      json.data = self.data
    if (self.summation)
      json.summation = self.summation.toJSON()
    if (self.options)
      json.options = self.options

    return json
  }

  return self
}
