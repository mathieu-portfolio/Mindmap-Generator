var currentDiagram = 0;
var diagrams = [];
var expandNumber = 1;

function init() {
  initGraph();
  initMindmap();
  load();
  updateFileList();
}

function initGraph() {
  // Since 2.2 you can also author concise templates with method chaining instead of GraphObject.make
  // For details, see https://gojs.net/latest/intro/buildingObjects.html
  const $ = go.GraphObject.make; // for conciseness in defining templates

  // some constants that will be reused within templates
  var roundedRectangleParams = {
    parameter1: 2, // set the rounded corner
    spot1: go.Spot.TopLeft,
    spot2: go.Spot.BottomRight, // make content go all the way to inside edges of rounded corners
  };

  diagrams[0] = new go.Diagram(
    "GraphDiv", // must name or refer to the DIV HTML element
    {
      "animationManager.initialAnimationStyle": go.AnimationManager.None,
      InitialAnimationStarting: (e) => {
        var animation = e.subject.defaultAnimation;
        animation.easing = go.Animation.EaseOutExpo;
        animation.duration = 900;
        animation.add(e.diagram, "scale", 0.1, 1);
        animation.add(e.diagram, "opacity", 0, 1);
      },

      // have mouse wheel events zoom in and out instead of scroll up and down
      "toolManager.mouseWheelBehavior": go.ToolManager.WheelZoom,
      // support double-click in background creating a new node
      "clickCreatingTool.archetypeNodeData": { text: "new node" },
      // enable undo & redo
      "undoManager.isEnabled": true,
      positionComputation: (diagram, pt) => {
        return new go.Point(Math.floor(pt.x), Math.floor(pt.y));
      },
    }
  );

  // when the document is modified, add a "*" to the title and enable the "Save" button
  diagrams[0].addDiagramListener("Modified", (e) => {
    var idx = document.title.indexOf("*");
    if (diagrams[0].isModified) {
      if (idx < 0) document.title += "*";
    } else {
      if (idx >= 0) document.title = document.title.slice(0, idx);
    }
  });

  // define the Node template
  diagrams[0].nodeTemplate = $(
    go.Node,
    "Auto",
    {
      locationSpot: go.Spot.Top,
      isShadowed: true,
      shadowBlur: 1,
      shadowOffset: new go.Point(0, 1),
      shadowColor: "rgba(0, 0, 0, .14)",
    },
    new go.Binding("location", "loc", go.Point.parse).makeTwoWay(
      go.Point.stringify
    ),
    // define the node's outer shape, which will surround the TextBlock
    $(go.Shape, "RoundedRectangle", roundedRectangleParams, {
      name: "SHAPE",
      fill: "#ffffff",
      strokeWidth: 0,
      stroke: null,
      portId: "", // this Shape is the Node's port, not the whole Node
      fromLinkable: true,
      fromLinkableSelfNode: true,
      fromLinkableDuplicates: true,
      toLinkable: true,
      toLinkableSelfNode: true,
      toLinkableDuplicates: true,
      cursor: "pointer",
    }),
    $(
      go.TextBlock,
      {
        font: "bold small-caps 11pt helvetica, bold arial, sans-serif",
        margin: 7,
        stroke: "rgba(0, 0, 0, .87)",
        editable: true, // editing the text automatically updates the model data
      },
      new go.Binding("text").makeTwoWay()
    )
  );

  // unlike the normal selection Adornment, this one includes a Button
  diagrams[0].nodeTemplate.selectionAdornmentTemplate = $(
    go.Adornment,
    "Spot",
    $(
      go.Panel,
      "Auto",
      $(go.Shape, "RoundedRectangle", roundedRectangleParams, {
        fill: null,
        stroke: "#7986cb",
        strokeWidth: 3,
      }),
      $(go.Placeholder) // a Placeholder sizes itself to the selected Node
    ),
    // the button to create a "next" node, at the top-right corner
    $(
      "Button",
      {
        alignment: go.Spot.TopRight,
        click: addNodeAndLink, // this function is defined below
      },
      $(go.Shape, "PlusLine", { width: 6, height: 6 })
    ) // end button
  ); // end Adornment

  diagrams[0].nodeTemplateMap.add(
    "Start",
    $(
      go.Node,
      "Spot",
      { desiredSize: new go.Size(75, 75) },
      new go.Binding("location", "loc", go.Point.parse).makeTwoWay(
        go.Point.stringify
      ),
      $(go.Shape, "Circle", {
        fill: "#52ce60" /* green */,
        stroke: null,
        portId: "",
        fromLinkable: true,
        fromLinkableSelfNode: true,
        fromLinkableDuplicates: true,
        toLinkable: true,
        toLinkableSelfNode: true,
        toLinkableDuplicates: true,
        cursor: "pointer",
      }),
      $(go.TextBlock, "Start", {
        font: "bold 16pt helvetica, bold arial, sans-serif",
        stroke: "whitesmoke",
      })
    )
  );

  diagrams[0].nodeTemplateMap.add(
    "End",
    $(
      go.Node,
      "Spot",
      { desiredSize: new go.Size(75, 75) },
      new go.Binding("location", "loc", go.Point.parse).makeTwoWay(
        go.Point.stringify
      ),
      $(go.Shape, "Circle", {
        fill: "maroon",
        stroke: null,
        portId: "",
        fromLinkable: true,
        fromLinkableSelfNode: true,
        fromLinkableDuplicates: true,
        toLinkable: true,
        toLinkableSelfNode: true,
        toLinkableDuplicates: true,
        cursor: "pointer",
      }),
      $(go.Shape, "Circle", {
        fill: null,
        desiredSize: new go.Size(65, 65),
        strokeWidth: 2,
        stroke: "whitesmoke",
      }),
      $(go.TextBlock, "End", {
        font: "bold 16pt helvetica, bold arial, sans-serif",
        stroke: "whitesmoke",
      })
    )
  );

  // clicking the button inserts a new node to the right of the selected node,
  // and adds a link to that new node
  function addNodeAndLink(e, obj) {
    var adornment = obj.part;
    var diagram = e.diagram;
    diagram.startTransaction("Add State");

    // get the node data for which the user clicked the button
    var fromNode = adornment.adornedPart;
    var fromData = fromNode.data;
    // create a new "State" data object, positioned off to the right of the adorned Node
    var toData = { text: "new" };
    var p = fromNode.location.copy();
    p.x += 200;
    toData.loc = go.Point.stringify(p); // the "loc" property is a string, not a Point object
    // add the new node data to the model
    const model = diagram.model;
    model.addNodeData(toData);

    // create a link data from the old node data to the new node data
    var linkdata = {
      from: model.getKeyForNodeData(fromData), // or just: fromData.id
      to: model.getKeyForNodeData(toData),
      text: "transition",
    };
    // and add the link data to the model
    model.addLinkData(linkdata);

    // select the new Node
    var newnode = diagram.findNodeForData(toData);
    diagram.select(newnode);

    diagram.commitTransaction("Add State");

    // if the new node is off-screen, scroll the diagram to show the new node
    diagram.scrollToRect(newnode.actualBounds);
  }

  // replace the default Link template in the linkTemplateMap
  diagrams[0].linkTemplate = $(
    go.Link, // the whole link panel
    {
      curve: go.Link.Bezier,
      adjusting: go.Link.Stretch,
      reshapable: true,
      relinkableFrom: true,
      relinkableTo: true,
      toShortLength: 3,
    },
    new go.Binding("points").makeTwoWay(),
    new go.Binding("curviness"),
    $(
      go.Shape, // the link shape
      { strokeWidth: 1.5 },
      new go.Binding("stroke", "progress", (progress) =>
        progress ? "#52ce60" /* green */ : "black"
      ),
      new go.Binding("strokeWidth", "progress", (progress) =>
        progress ? 2.5 : 1.5
      )
    ),
    $(
      go.Shape, // the arrowhead
      { toArrow: "standard", stroke: null },
      new go.Binding("fill", "progress", (progress) =>
        progress ? "#52ce60" /* green */ : "black"
      )
    ),
    $(
      go.Panel,
      "Auto",
      $(
        go.Shape, // the label background, which becomes transparent around the edges
        {
          fill: $(go.Brush, "Radial", {
            0: "rgb(245, 245, 245)",
            0.7: "rgb(245, 245, 245)",
            1: "rgba(245, 245, 245, 0)",
          }),
          stroke: null,
        }
      ),
      $(
        go.TextBlock,
        "transition", // the label text
        {
          textAlign: "center",
          font: "9pt helvetica, arial, sans-serif",
          margin: 4,
          editable: true, // enable in-place editing
        },
        // editing the text automatically updates the model data
        new go.Binding("text").makeTwoWay()
      )
    )
  );
}

function initMindmap() {
  // Since 2.2 you can also author concise templates with method chaining instead of GraphObject.make
  // For details, see https://gojs.net/latest/intro/buildingObjects.html
  const $ = go.GraphObject.make;

  diagrams[1] = new go.Diagram("MindmapDiv", {
    "animationManager.initialAnimationStyle": go.AnimationManager.None,
    InitialAnimationStarting: (e) => {
      var animation = e.subject.defaultAnimation;
      animation.easing = go.Animation.EaseOutExpo;
      animation.duration = 900;
      animation.add(e.diagram, "scale", 0.1, 1);
      animation.add(e.diagram, "opacity", 0, 1);
    },
    // when the user drags a node, also move/copy/delete the whole subtree starting with that node
    "commandHandler.copiesTree": true,
    "commandHandler.copiesParentKey": true,
    "commandHandler.deletesTree": true,
    "draggingTool.dragsTree": true,
    "undoManager.isEnabled": true,
    // have mouse wheel events zoom in and out instead of scroll up and down
    "toolManager.mouseWheelBehavior": go.ToolManager.WheelZoom,
  });

  function adjustScrollMargin(diagram) {
    var margin =
      Math.min(diagram.documentBounds.width, diagram.documentBounds.height) *
      0.8;
    diagram.scrollMargin = new go.Margin(margin, margin, margin, margin);
  }

  diagrams[1].addDiagramListener("LayoutCompleted", (e) => {
    adjustScrollMargin(e.diagram);
  });

  // when the document is modified, add a "*" to the title and enable the "Save" button
  diagrams[1].addDiagramListener("Modified", (e) => {
    var idx = document.title.indexOf("*");
    if (diagrams[1].isModified) {
      if (idx < 0) document.title += "*";
    } else {
      if (idx >= 0) document.title = document.title.slice(0, idx);
    }
  });

  // a node consists of some text with a line shape underneath
  diagrams[1].nodeTemplate = $(
    go.Node,
    "Vertical",
    { selectionObjectName: "TEXT" },
    new go.Binding("isTreeExpanded", "isTreeExpanded").makeTwoWay(),
    $(
      go.TextBlock,
      {
        name: "TEXT",
        minSize: new go.Size(30, 15),
        editable: true,
      },
      // remember not only the text string but the scale and the font in the node data
      new go.Binding("text", "text").makeTwoWay(),
      new go.Binding("scale", "scale").makeTwoWay(),
      new go.Binding("font", "font").makeTwoWay(),
      new go.Binding("pageTitle", "pageTitle").makeTwoWay(),
    ),
    $(
      go.Shape,
      "LineH",
      {
        stretch: go.GraphObject.Horizontal,
        strokeWidth: 3,
        height: 3,
        // this line shape is the port -- what links connect with
        portId: "",
        fromSpot: go.Spot.LeftRightSides,
        toSpot: go.Spot.LeftRightSides,
      },
      new go.Binding("stroke", "brush"),
      // make sure links come in from the proper direction and go out appropriately
      new go.Binding("fromSpot", "dir", (d) => spotConverter(d, true)),
      new go.Binding("toSpot", "dir", (d) => spotConverter(d, false))
    ),
    // remember the locations of each node in the node data
    new go.Binding("location", "loc", go.Point.parse).makeTwoWay(
      go.Point.stringify
    ),
    // make sure text "grows" in the desired direction
    new go.Binding("locationSpot", "dir", (d) => spotConverter(d, false)),
    // Add TreeExpanderButton to each node
    $(
      "Button",
      new go.Binding("visible", "leaves", leaves => leaves > 0),
      new go.Binding("alignment", "dir", dir => {
        x = dir == 'left' ? 0 : 1;
        return new go.Spot(x, 0.5, 0, 0);
      }),
      new go.Binding("width", "scale", scale => (5 * scale)),
      new go.Binding("height", "scale", scale => (5 * scale)),
      new go.Binding("ButtonBorder.strokeWidth", "scale", scale => (0.1 * scale)),
      {
        // set properties on the border Shape of the "Button"
        "ButtonBorder.figure": "Circle",
        "ButtonBorder.fill": "#ffffff80",
        "ButtonBorder.stroke": "#00000080",
        click: function(e, obj) {
          node = obj.part;
          setChildrenVisibility(node, !node.isTreeExpanded, expandNumber);
          layoutAll();
        }
      },
      $(
        go.TextBlock,
        {
          stroke: "#00000080",
          alignment: go.Spot.Center
        },
        new go.Binding("font", "scale", scale => (3 * scale) + "px Calibri"),
        new go.Binding("text", "isTreeExpanded", function(isTreeExpanded, node) {
          return isTreeExpanded ? "-" : "+";
        }).ofObject(),
      )
    ),
  );

  // selected nodes show a button for adding children
  diagrams[1].nodeTemplate.selectionAdornmentTemplate = $(
    go.Adornment,
    "Spot",
    $(
      go.Panel,
      "Auto",
      // this Adornment has a rectangular blue Shape around the selected node
      $(go.Shape, { fill: null, stroke: "dodgerblue", strokeWidth: 3 }),
      $(go.Placeholder, { margin: new go.Margin(4, 4, 0, 4) })
    ),
    // and this Adornment has a Button to the right of the selected node
    $(
      "Button",
      {
        alignment: go.Spot.Right,
        alignmentFocus: go.Spot.Left,
        click: addNodeAndLink, // define click behavior for this Button in the Adornment
      },
      $(
        go.TextBlock,
        "+", // the Button content
        { font: "bold 8pt sans-serif" }
      )
    ),
    $(
      "Button",
      new go.Binding("scale", "scale"),
        {
          alignment: new go.Spot(0.5, -0.4, 0, 0),
          click: function(e, obj) {
            const node = obj.part.data;
            const section = node.text;
            const pageTitle = getPageTitle(node);
            if (pageTitle)
              openSectionInNewTab(pageTitle, section);
          }
        },
        $(
          go.TextBlock,
          "View Section", // the Button content
          { font: "8pt sans-serif" }
        )
      )
  );

  // the context menu allows users to change the font size and weight,
  // and to perform a limited tree layout starting at that node
  diagrams[1].nodeTemplate.contextMenu = $(
    "ContextMenu",
    $("ContextMenuButton", $(go.TextBlock, "Bigger"), {
      click: (e, obj) => changeTextSize(obj, 1.1),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Smaller"), {
      click: (e, obj) => changeTextSize(obj, 1 / 1.1),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Bold/Normal"), {
      click: (e, obj) => toggleTextWeight(obj),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Copy"), {
      click: (e, obj) => e.diagram.commandHandler.copySelection(),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Delete"), {
      click: (e, obj) => e.diagram.commandHandler.deleteSelection(),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Undo"), {
      click: (e, obj) => e.diagram.commandHandler.undo(),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Redo"), {
      click: (e, obj) => e.diagram.commandHandler.redo(),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Layout"), {
      click: (e, obj) => {
        var adorn = obj.part;
        adorn.diagram.startTransaction("Subtree Layout");
        layoutTree(adorn.adornedPart);
        adorn.diagram.commitTransaction("Subtree Layout");
      },
    })
  );

  // a link is just a Bezier-curved line of the same color as the node to which it is connected
  diagrams[1].linkTemplate = $(
    go.Link,
    {
      curve: go.Link.Bezier,
      fromShortLength: -2,
      toShortLength: -2,
      selectable: false,
    },
    $(
      go.Shape,
      { strokeWidth: 3 },
      new go.Binding("stroke", "toNode", (n) => {
        if (n.data.brush) return n.data.brush;
        return "black";
      }).ofObject()
    )
  );

  // the Diagram's context menu just displays commands for general functionality
  diagrams[1].contextMenu = $(
    "ContextMenu",
    $(
      "ContextMenuButton",
      $(go.TextBlock, "Paste"),
      {
        click: (e, obj) =>
          e.diagram.commandHandler.pasteSelection(
            e.diagram.toolManager.contextMenuTool.mouseDownPoint
          ),
      },
      new go.Binding(
        "visible",
        "",
        (o) =>
          o.diagram &&
          o.diagram.commandHandler.canPasteSelection(
            o.diagram.toolManager.contextMenuTool.mouseDownPoint
          )
      ).ofObject()
    ),
    $(
      "ContextMenuButton",
      $(go.TextBlock, "Undo"),
      { click: (e, obj) => e.diagram.commandHandler.undo() },
      new go.Binding(
        "visible",
        "",
        (o) => o.diagram && o.diagram.commandHandler.canUndo()
      ).ofObject()
    ),
    $(
      "ContextMenuButton",
      $(go.TextBlock, "Redo"),
      { click: (e, obj) => e.diagram.commandHandler.redo() },
      new go.Binding(
        "visible",
        "",
        (o) => o.diagram && o.diagram.commandHandler.canRedo()
      ).ofObject()
    ),
    $("ContextMenuButton", $(go.TextBlock, "Save"), {
      click: (e, obj) => save(),
    }),
    $("ContextMenuButton", $(go.TextBlock, "Load"), {
      click: (e, obj) => load(),
    })
  );

  diagrams[1].addDiagramListener("SelectionMoved", (e) => {
    var rootX = diagrams[1].findNodeForKey(0).location.x;
    diagrams[1].selection.each((node) => {
      if (node.data.parent !== 0) return; // Only consider nodes connected to the root
      var nodeX = node.location.x;
      if (rootX < nodeX && node.data.dir !== "right") {
        updateNodeDirection(node, "right");
      } else if (rootX > nodeX && node.data.dir !== "left") {
        updateNodeDirection(node, "left");
      }
      layoutTree(node);
    });
    adjustScrollMargin(e.diagram);
  });
}

function spotConverter(dir, from) {
  if (dir === "left") {
    return from ? go.Spot.Left : go.Spot.Right;
  } else {
    return from ? go.Spot.Right : go.Spot.Left;
  }
}

function changeTextSize(obj, factor) {
  var adorn = obj.part;
  adorn.diagram.startTransaction("Change Text Size");
  var node = adorn.adornedPart;
  var tb = node.findObject("TEXT");
  tb.scale *= factor;
  adorn.diagram.commitTransaction("Change Text Size");
}

function toggleTextWeight(obj) {
  var adorn = obj.part;
  adorn.diagram.startTransaction("Change Text Weight");
  var node = adorn.adornedPart;
  var tb = node.findObject("TEXT");
  // assume "bold" is at the start of the font specifier
  var idx = tb.font.indexOf("bold");
  if (idx < 0) {
    tb.font = "bold " + tb.font;
  } else {
    tb.font = tb.font.slice(idx + 5);
  }
  adorn.diagram.commitTransaction("Change Text Weight");
}

function updateNodeDirection(node, dir) {
  diagrams[1].model.setDataProperty(node.data, "dir", dir);
  // recursively update the direction of the child nodes
  var chl = node.findTreeChildrenNodes(); // gives us an iterator of the child nodes related to this particular node
  while (chl.next()) {
    updateNodeDirection(chl.value, dir);
  }
}

function addNodeAndLink(e, obj) {
  var adorn = obj.part;
  var diagram = adorn.diagram;
  diagram.startTransaction("Add Node");
  var oldnode = adorn.adornedPart;
  var olddata = oldnode.data;
  // copy the brush and direction to the new node data
  var newdata = {
    text: "idea",
    brush: olddata.brush,
    dir: olddata.dir,
    parent: olddata.key,
  };
  diagram.model.addNodeData(newdata);
  oldnode.expandTree();
  layoutTree(oldnode);
  diagram.commitTransaction("Add Node");

  // if the new node is off-screen, scroll the diagram to show the new node
  var newnode = diagram.findNodeForData(newdata);
  if (newnode !== null) diagram.scrollToRect(newnode.actualBounds);
}

function layoutTree(node) {
  if (node.data.key === 0) {
    // adding to the root?
    layoutAll(); // lay out everything
  } else {
    // otherwise lay out only the subtree starting at this parent node
    var parts = node.findTreeParts();
    layoutAngle(parts, node.data.dir === "left" ? 180 : 0);
  }
}

function layoutAngle(parts, angle) {
  var layout = go.GraphObject.make(go.TreeLayout, {
    angle: angle,
    arrangement: go.TreeLayout.ArrangementFixedRoots,
    nodeSpacing: 5,
    layerSpacing: 20,
    setsPortSpot: false, // don't set port spots since we're managing them with our spotConverter function
    setsChildPortSpot: false,
  });
  layout.doLayout(parts);
}

function layoutAll() {
  var root = diagrams[1].findNodeForKey(0);
  if (root === null) return;
  diagrams[1].startTransaction("Layout");
  // split the nodes and links into two collections
  splitChildren();
  var rightward = new go.Set(/*go.Part*/);
  var leftward = new go.Set(/*go.Part*/);
  root.findLinksConnected().each((link) => {
    var child = link.toNode;
    if (child.data.dir === "left") {
      leftward.add(root); // the root node is in both collections
      leftward.add(link);
      leftward.addAll(child.findTreeParts());
    } else {
      rightward.add(root); // the root node is in both collections
      rightward.add(link);
      rightward.addAll(child.findTreeParts());
    }
  });
  // do one layout and then the other without moving the shared root node
  layoutAngle(rightward, 0);
  layoutAngle(leftward, 180);
  diagrams[1].commitTransaction("Layout");
}

function getPageTitle(node) {
  const model = diagrams[1].model;

  while (node) {
    const parentKey = model.getParentKeyForNodeData(node);
    if (!parentKey)
      return node.text;
    if (node.pageTitle)
      return node.pageTitle;
    node = model.findNodeDataForKey(parentKey);
  }

  return null;
}

function openSectionInNewTab(pageTitle, sectionTitle) {
  let url = `https://en.wikipedia.org/wiki/${pageTitle}`;

  if (sectionTitle != pageTitle) {
    const anchorId = sectionTitle.replace(/ /g, '_').replace(/[^\w-]/g, '');
    url += `#${anchorId}`;
  }

  const newWindow = window.open(url, '_blank');
  console.log(newWindow);
  if (newWindow === null || typeof(newWindow) === 'undefined')
    alert('Les pop-ups sont bloqués. Veuillez autoriser les pop-ups pour ce site et réessayer.');
}

function setChildrenVisibility(node, visibility, depth) {
  if (!node) return;

  var diagram = node.diagram;
  diagram.startTransaction("setChildrenVisibility");

  if (visibility) {
    // Expand the node, then collapse children at the given depth
    node.expandTree();
    function collapseAtDepth(childNode, depthRemaining) {
      if (!childNode) return;
      if (depthRemaining === 0) {
        childNode.collapseTree();
        return;
      }
      childNode.expandTree();
      childNode.findTreeChildrenNodes().each(function(grandChild) {
        collapseAtDepth(grandChild, depthRemaining - 1);
      });
    }
    collapseAtDepth(node, depth);
  } else {
    // Collapse all descendants
    node.collapseTree();
  }

  diagram.commitTransaction("setChildrenVisibility");
}

function expandAll() {
  var root = diagrams[1].findNodeForKey(0);
  setChildrenVisibility(root, true, 100);
}

function setExpandNumber(value) {
  expandNumber = value;
}

function setLeaves(model) {
  model.nodeDataArray.forEach(node => {
    node.leaves = 0;
  });

  model.nodeDataArray.forEach(node => {
    const hasChildren = model.nodeDataArray.some(child => child.parent === node.key);
    if (!hasChildren) {
      setBranchLeaves(model, node);
    }
  });
}

function setBranchLeaves(model, node) {
  const parentNode = model.findNodeDataForKey(node.parent);
  if (!parentNode) return;
  parentNode.leaves += 1;
  setBranchLeaves(model, parentNode);
}

function splitChildren() {
  const model = diagrams[1].model;
  setLeaves(model);
  const childrenIDs = model.nodeDataArray.filter(node => node.parent === 0);
  childrenIDs.sort((a, b) => b.leaves - a.leaves);

  let leftSum = 0;
  let rightSum = 0;

  const setDirectionRecursively = (node, direction) => {
    node.dir = direction;
    const children = model.nodeDataArray.filter(child => child.parent === node.key);
    children.forEach(child => setDirectionRecursively(child, direction));
  };

  for (const child of childrenIDs) {
    const direction = leftSum < rightSum ? "left" : "right";
    setDirectionRecursively(child, direction);
    if (direction === "left") {
      leftSum += Math.max(1, child.leaves);
    } else {
      rightSum += Math.max(1, child.leaves);
    }
  }

  model.nodeDataArray.forEach(node => {
    model.updateTargetBindings(node);
  });
}

function generate() {
  diagram = diagrams[currentDiagram];
  diagram.startTransaction("Generate");
  var url = document.getElementById("urlInput").value;
  var maxDepth = document.getElementById("depthInput").value;

  // Show the loader
  document.getElementById("loader").style.display = "block";

  fetch("/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: url, max_depth: maxDepth }),
  })
    .then((response) => response.json())
    .then((data) => {
      // The mindmap was successfully generated
      // Load the mindmap
      document.getElementById("mySavedModel").value = JSON.stringify(data);
      load();
      layoutAll();
      diagram.nodes.each(function (node) {
        node.collapseTree();
      });
      diagram.isModified = true;
    })
    .catch((error) => console.error("Error:", error))
    .finally(() => {
      document.getElementById("loader").style.display = "none";
    });

  diagram.commitTransaction("Generate");
}

////////////////////////////////////////////////////////////////////////////////////////////////
// Load files

function displayDiagram(idx) {
  var diagram;
  for (diagram of diagrams) diagram.div.style.display = "none";
  diagrams[idx].div.style.display = "block";
}

function save() {
  diagram = diagrams[currentDiagram];
  diagram.startTransaction("Save");
  var modelData = diagram.model.toJson();

  var filename = prompt("Nom du fichier: ", "myDiagram");
  if (filename === null) return;

  fetch("/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelData: modelData, filename: filename }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        document.title = filename;
        document.getElementById("mySavedModel").value = modelData;
        diagram.isModified = false;
        updateFileList();
      }
    })
    .catch((error) => console.error("Error:", error));
  diagram.commitTransaction("Layout");
}
function load() {
  var jsonData = document.getElementById("mySavedModel").value;
  var modelData = JSON.parse(jsonData);

  switch (modelData.class) {
    case "GraphLinksModel":
    case "go.GraphLinksModel":
      currentDiagram = 0;
      break;
    case "TreeModel":
    case "go.TreeModel":
      currentDiagram = 1;
      break;
    default:
      displayDiagram(currentDiagram);
      return;
  }

  diagram = diagrams[currentDiagram];
  displayDiagram(currentDiagram);
  diagram.model = go.Model.fromJson(jsonData);
  if (currentDiagram == 1) layoutAll();
}

function loadFromFile() {
  var selectElement = document.getElementById("jsonFileSelect");
  var selectedFile = selectElement.value;

  if (!selectedFile) return;

  fetch(`/get_mindmap/${selectedFile}`)
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("mySavedModel").value = JSON.stringify(data);
      load();
      document.title = selectedFile;
      diagram = diagrams[currentDiagram];
      diagram.isModified = false;
    })
    .catch((error) => console.error("Error:", error));
}

function deleteFile(filename) {
  diagram = diagrams[currentDiagram];
  diagram.startTransaction("Delete file");
  fetch(`/delete/${filename}`, {
    method: "POST",
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        updateFileList();
        diagram.isModified = true;
      } else {
        alert("Failed to delete file: " + data.error);
      }
    })
    .catch((error) => console.error("Error:", error));

  diagram.commitTransaction("Delete file");
}

function updateFileList() {
  fetch("/get_json_files")
    .then((response) => response.json())
    .then((data) => {
      // data is the list of file names

      // remove any existing options
      var select = document.getElementById("jsonFileSelect");
      var loadFileBtn = document.getElementById("LoadFileButton");
      var deleteBtn = document.getElementById("DeleteButton");
      select.innerHTML = "";

      if (data.length === 0) {
        select.disabled = true;
        loadFileBtn.disabled = true;
        deleteBtn.disabled = true;
        var opt = document.createElement("option");
        opt.value = "";
        opt.innerHTML = "Aucun fichier";
        select.appendChild(opt);
      } else {
        select.disabled = false;
        loadFileBtn.disabled = false;
        deleteBtn.disabled = false;
        // add an option for each file
        for (var i = 0; i < data.length; i++) {
          var opt = document.createElement("option");
          opt.value = data[i];
          opt.innerHTML = data[i];
          select.appendChild(opt);
        }
      }
    })
    .catch((error) => console.error("Error:", error));
}

function updateInputs() {
  var urlInput = document.getElementById("urlInput");
  var depthInput = document.getElementById("depthInput");
  var generateButton = document.getElementById("GenerateButton");

  generateButton.disabled = !urlInput.value || !depthInput.value;
}

function toggleFullscreen() {
  diagram = diagrams[currentDiagram];
  elem = diagram.div;

  if (!document.fullscreenElement) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      /* Firefox */
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      /* Chrome, Safari & Opera */
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      /* IE/Edge */
      elem.msRequestFullscreen();
    }
  }
}

window.onload = function () {
  // Hide the loader
  document.getElementById("loader").style.display = "none";
  updateInputs();
};


window.addEventListener("DOMContentLoaded", init);
