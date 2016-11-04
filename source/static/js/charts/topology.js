var layouts_url = 'http://127.0.0.1:5000/kytos/web/topology/layouts/';

// Nodes vars
var charge = {'switch': 400,
              'interface': -20,
              'host': 20};

var size = {'switch': 20,
            'interface': 5,
            'host': 10};

var nodes_fill = {'switch': "rgba(255,255,255,0)",
                  'interface': "rgba(255,255,255,0.5)",
                  'host': "rgba(255,0,0,1)"};

var nodes_stroke = {'switch': "rgba(255,255,255,0.5)",
                    'interface': "rgba(255,255,255,0.5)",
                    'host': "rgba(255,255,255.0.5)"};

// Links vars
var strength = {'link': 0.001,
                'interface': 2,
                'host': 0.05};

var distance = {'link': 20 * size['switch'],
                'interface': size['switch'] + 10,
                'host': 5 * size['interface']};

var strokes = {'interface': 0,
               'link': 1,
               'host': 1};

var width = $("#topology-chart").parent().width();
var height = 600;

var zoom = d3.zoom()
            .scaleExtent([0.2, 3])
            //.translateExtent([[-100, -100], [width + 90, height + 100]])
            .on("zoom", zoomed);

var svg = d3.select("#topology-chart")
             .append("svg")
             .attr("width", width)
             .attr("height", height);

var zoomer = svg.append("rect")
                .attr("width", width)
                .attr("height", height)
                .style("fill", "none")
                .style("pointer-events", "all")
                .call(zoom)
                .on('click', highlight_all_nodes);

var container = svg.append('g')

zoomer.call(zoom.transform, d3.zoomIdentity.translate(0,0));

var color = d3.scaleOrdinal(d3.schemeCategory20);

var simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function(d) { return d.id; })
                                 .strength(function(d) { return strength[d.type]; })
                                 .distance(function(d) { return distance[d.type]; })
          )
    .force("charge", d3.forceManyBody().theta(1)) //strength(function(d) {return 10^-10;}))
    .force("center", d3.forceCenter(width / 2, height / 2));

url = "http://localhost:5000/kytos/topology"
d3.json(url,function(error, graph) {
  if (error) throw error;

  var link = container.append("g")
      .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter().append("line")
      .attr("stroke-width", function(d) { return strokes[d.type]; })

  var node = container.append("g")
      .attr("class", "nodes")
    .selectAll("circle")
    .data(graph.nodes)
    .enter().append("circle")
      .attr("id", function(d) {
          return "node-" + d.type + "-" + fix_name(d.name); })
      .attr("r", function(d) { return get_node_size(d.type); })
      .attr("stroke", function(d) { return nodes_stroke[d.type]; })
      .attr("stroke-width", 2)
      .attr("fill", function(d) { return nodes_fill[d.type]; })
      .call(d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended))
      .on('click', show_context)
      .on("dblclick", release_node);

  node.append("title")
      .text(function(d) { return d.name; });

  simulation
      .nodes(graph.nodes)
      .on("tick", ticked);

  simulation.force("link")
      .links(graph.links);

  function ticked() {
    link
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    node
        .attr("cx", function(d) { return d.x; })
        .attr("cy", function(d) { return d.y; });
  }
});

function get_node_size(type) {
  return size[type];
}

function dragstarted(d) {
  if (!d3.event.active) simulation.alphaTarget(0.3).restart();
  if ( d.type == 'switch' ) {
    d.old_fx = d.x;
    d.old_fy = d.y;
  }
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(d) {
  if ( d.type == 'switch' ) {
    d.old_fx = d.fx;
    d.old_fy = d.fy;
    d.fx = d3.event.x;
    d.fy = d3.event.y;
    delta_x = d.fx - d.old_fx;
    delta_y = d.fy - d.old_fy;
    $.each(get_switch_interfaces(d), function(index, interface){
      if (interface.fx == undefined) {
        interface.fx = interface.x;
        interface.fy = interface.y;
      }
      interface.fx += delta_x;
      interface.fy += delta_y;
    });
  } else if ( d.type == 'interface' ) {
    owner = get_interface_owner(d);
    if (owner.fx == undefined) {
      cx = owner.x;
      cy = owner.y;
    } else {
      cx = owner.fx;
      cy = owner.fy;
    }
    new_positions = radius_positioning(cx, cy, d3.event.x, d3.event.y);
    d.fx = new_positions[0]
    d.fy = new_positions[1]
  } else {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }
}

function dragended(d) {
  if (!d3.event.active) simulation.alphaTarget(0);
  // uncomment the lines bellow to disable de fixed drag behavior
  //if ( d.type == 'interface' ) {
      //release_node(d);
  //}
}

function release_node(d) {
  d.fx = null;
  d.fy = null;
  if (d.type == 'switch') {
    $.each(get_switch_interfaces(d), function(index, interface){
      interface.fx = null;
      interface.fy = null;
    });
  }
}

function get_interface_owner(d){
  /* Get the switch in which the 'd' interface is connected */
  searched_switch = null;
  $.each(simulation.force('link').links(), function(index, link) {
    if (link.type == 'interface' && link.target.name == d.name) {
      searched_switch = link.source;
    }
  });
  return searched_switch;
}

function get_switch_interfaces(d){
  /* Get all interfaces associated to the 'd' host */
  interfaces = []
  $.each(simulation.force('link').links(), function(index, link) {
    if (link.type == 'interface' && link.source.name == d.name) {
      interfaces.push(link.target);
    }
  });
  return interfaces;
}

function get_nodes_by_type(type) {
  selected_nodes = [];
  $.each(simulation.nodes(), function(index, node){
      if (node.type == type) { selected_nodes.push(node); };
  });
  return selected_nodes;
}

function get_interfaces() {
  return get_nodes_by_type('interface');
}

function get_hosts() {
  return get_nodes_by_type('host');
}

function get_node_links(node) {
  links = [];
  $.each(simulation.force('link').links(), function(index, link) {
    if (link.target == node || link.source == node )
      links.push(link);
  });
  return links;
}

function radius_positioning(cx, cy, x, y) {
  delta_x = x - cx;
  delta_y = y - cy;
  rad = Math.atan2(delta_y, delta_x);
  new_x = cx + Math.cos(rad) * distance['interface'];
  new_y = cy + Math.sin(rad) * distance['interface'];

  return [new_x, new_y];
}

function toggle_unused_interfaces(hide){
  $.each(get_interfaces(), function(index, interface){
    unused = true;
    $.each(get_node_links(interface), function(index, link){
      if (link.type == 'link') unused = false;
    });
    if (unused) {
      d3.select("#node-interface-" + fix_name(interface.name))
        .classed('invisible', hide);
    }
  })
}

function toggle_disconnected_hosts(hide){
  $.each(get_hosts(), function(index, host){
    links = get_node_links(host);
    if (links.length == 0) {
      d3.select("#node-host-" + fix_name(host.name))
        .classed('invisible', hide);
    }
  })
}

function node_highlight(node) {
  d3.select("#node-" + node.type + "-" + fix_name(node.name))
    .classed('downlight', false);
}

function node_downlight(node) {
  d3.select("#node-" + node.type + "-" + fix_name(node.name))
    .selection.classed('downlight', true);
}

function highlight_all_switches() {
  d3.selectAll("[id^='node-switch-']").classed('downlight', false);
}

function highlight_all_interfaces() {
  d3.selectAll("[id^='node-interface-']").classed('downlight', false);
}

function highlight_all_nodes() {
  d3.selectAll("[id^='node-']").classed('downlight', false);
  $('#context-target').html('Loading ...');
  $('#tab_terminal_button a').click();
}

function downlight_all_switches() {
  d3.selectAll("[id^='node-switch-']").classed('downlight', true);
}

function downlight_all_interfaces() {
  d3.selectAll("[id^='node-interface-']").classed('downlight', true);
}

function highlight_switch(obj) {
  downlight_all_switches();
  downlight_all_interfaces();
  node_highlight(obj);
  $.each(get_switch_interfaces(obj), function(idx, interface){
    node_highlight(interface)
  });
}

function zoomed() {
  container.attr("transform", d3.event.transform);
}

function resetted() {
  container.transition()
    .duration(450)
    .call(zoom.transform, d3.zoomIdentity);
}

function show_context(d) {
  if (d.type == 'switch') {
    data = {'name': d.name,
            'dpid': d.dpid,
            'connection': d.connection,
            'ofp_version': d.ofp_version,
            'hardware': d.hardware,
            'software': d.software,
            'interfaces': []};
    interfaces = get_switch_interfaces(d);
    $.each(interfaces, function(idx, interface){
        iface = {'name': interface.name,
                 'port_number': interface.port_number,
                 'mac': interface.mac,
                 'speed': 'To Be Done...'}
        data.interfaces.push(iface)
    });
    show_switch_context(data);
    highlight_switch(d);
  }
}

function fix_name(name) {
  return name.toString().replace(/:/g, '__');
}

function unfix_name(name) {
  return name.toString().replace(/\_\_/g, ':');
}

function get_current_layout() {
  /*
    {
      nodes: {
        <node_name>: {
          type: ,
          x: ,
          y: ,
          fx: ,
          fy: ,
          downlight: ,
          invisible:
        },
        ...
      },
      other_settings: {
       .....
      }
    }
   */
  layout = {'nodes': {}, 'other_settings': {}};
  $.each(simulation.nodes(), function(idx, node) {
    d3node = d3.select('#node-' + node.type + '-' + fix_name(node.name));
    node_data = {
      'name': node.name,
      'type': node.type,
      'x': node.x,
      'y': node.y,
      'fx': node.fx,
      'fy': node.fy,
      'downlight': d3node.classed('downlight'),
    };
    layout.nodes[node.name] = node_data;
  });
  layout.other_settings['hide_unused_interfaces'] = $('#hide_unused_interfaces')[0].checked;
  layout.other_settings['hide_disconnected_hosts'] = $('#hide_disconnected_hosts')[0].checked;
  return layout;
}

function save_layout() {
  layout_name = $('#layout-name')[0].value;
  if (layout_name == '') {
    alert('Please, choose a name for the layout.');
  } else {
    layout = get_current_layout();
    data = JSON.stringify(layout);
    $.ajax({
      type: "POST",
      url: layouts_url + layout_name,
      data: data,
      success: function(data) {
        alert('Layout ' + layout_name + ' saved.');
        $('#saveLayout').modal('hide');
      },
      contentType: "application/json",
      dataType: "json"
    })
    .done(function(){
        alert('Layout ' + layout_name + ' saved.');
        $('#saveLayout').modal('hide');
    });
    $('#saveLayout').modal('hide');
  }
}

function get_saved_layouts() {
  $.ajax({
    async: false,
    dataType: "json",
    url: layouts_url,
    success: function(data) {
      return JSON.parse(data);
    }
  });
}

function load_layouts() {
  $.ajax({
    dataType: "json",
    url: layouts_url,
    success: function(layouts) {
      if (layouts == undefined) {
        alert("There isn't any saved layout to be loaded");
      } else {
        $('#savedLayouts').empty();
        opt = '<option selected="true" disabled="disabled">Selecione seu Layout</option>'
        $('#savedLayouts')
          .append(opt);
        $.each(layouts, function (idx, item) {
          $('<option>').val(item).text(item).appendTo('#savedLayouts');
        });
      }
    }
  });
}

function restore_layout(name) {
  if ( name === undefined ) {
    name = $('#savedLayouts').val();
  }
  $.getJSON(layouts_url + name, function(layout) {
    $.each(simulation.nodes(), function(idx, node) {
      if (node.name in layout.nodes) {
        restored_node = layout.nodes[node.name];
        node.x = restored_node.x;
        node.y = restored_node.y;
        node.fx = restored_node.fx;
        node.fy = restored_node.fy;
        d3node = d3.select('#node-' + node.type + '-' + fix_name(node.name))
                      .classed('downlight', restored_node.downlight);
      }
    });
    checkbox_interfaces = $('#hide_unused_interfaces');
    if (layout.other_settings.hide_unused_interfaces != checkbox_interfaces[0].checked) {
      checkbox_interfaces.click();
    }
    checkbox_hosts = $('#hide_disconnected_hosts');
    if (layout.other_settings.hide_disconnected_hosts != checkbox_hosts[0].checked) {
      checkbox_hosts.click();
    }
    simulation.restart();
  });
}

$('#savedLayouts').ready(load_layouts);
