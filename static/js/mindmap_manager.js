/**
 * @file mindmap_manager.js
 * @brief Handles mindmap visualization and layout.
 * @module MindmapVManager
 */

/**
 * Initializes the mindmap diagram using GoJS.
 */
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

/**
 * Converts a node's direction to determine port placement.
 * @param {string} dir - The node's direction ('left' or 'right').
 * @param {boolean} from - Whether the spot is for an outgoing link.
 * @returns {go.Spot} - The computed GoJS Spot position.
 */
function spotConverter(dir, from) {
  if (dir === "left") {
    return from ? go.Spot.Left : go.Spot.Right;
  } else {
    return from ? go.Spot.Right : go.Spot.Left;
  }
}

/**
 * Opens a specific Wikipedia section in a new browser tab.
 * @param {string} pageTitle - The Wikipedia page title.
 * @param {string} sectionTitle - The section title to navigate to.
 */
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

/**
 * Changes the text size of a selected node.
 * @param {go.GraphObject} obj - The clicked object within the context menu.
 * @param {number} factor - Scaling factor to increase/decrease size.
 */
function changeTextSize(obj, factor) {
  var adorn = obj.part;
  adorn.diagram.startTransaction("Change Text Size");
  var node = adorn.adornedPart;
  var tb = node.findObject("TEXT");
  tb.scale *= factor;
  adorn.diagram.commitTransaction("Change Text Size");
}

/**
 * Toggles bold formatting for a node's text.
 * @param {go.GraphObject} obj - The clicked object within the context menu.
 */
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

/**
 * Updates the direction of a node and its children.
 * @param {go.Node} node - The node to update.
 * @param {string} dir - The new direction ('left' or 'right').
 */
function updateNodeDirection(node, dir) {
  diagrams[1].model.setDataProperty(node.data, "dir", dir);
  // recursively update the direction of the child nodes
  var chl = node.findTreeChildrenNodes(); // gives us an iterator of the child nodes related to this particular node
  while (chl.next()) {
    updateNodeDirection(chl.value, dir);
  }
}

/**
 * Adds a new node and links it to the selected node.
 * @param {go.InputEvent} e - The event object.
 * @param {go.GraphObject} obj - The object clicked.
 */
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

/**
 * Layouts the tree structure based on node direction.
 * @param {go.Node} node - The node from which to start layout changes.
 */
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

/**
 * Applies a hierarchical layout at a given angle.
 * @param {go.Set<go.Part>} parts - The subset of nodes and links to layout.
 * @param {number} angle - The layout angle (0° for right, 180° for left).
 */
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

/**
 * Applies a tree layout with a fixed root arrangement.
 */
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

/**
 * Splits child nodes into left and right branches.
 */
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

/**
 * Initializes the leaf count for each node in the model.
 * Nodes that do not have children will be marked as leaves.
 * 
 * @param {go.Model} model - The GoJS model containing node data.
 */
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

/**
 * Recursively updates the leaf count for a branch.
 * Each parent node accumulates the number of its leaf children.
 * 
 * @param {go.Model} model - The GoJS model containing node data.
 * @param {Object} node - The current node being processed.
 */
function setBranchLeaves(model, node) {
  const parentNode = model.findNodeDataForKey(node.parent);
  if (!parentNode) return;
  parentNode.leaves += 1;
  setBranchLeaves(model, parentNode);
}

/**
 * Updates the visibility of child nodes in the diagram.
 * @param {go.Node} node - The target node.
 * @param {boolean} visibility - Whether to expand or collapse children.
 * @param {number} depth - Depth level to expand.
 */
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

/**
 * Expands all nodes in the mindmap.
 */
function expandAll() {
  var root = diagrams[1].findNodeForKey(0);
  setChildrenVisibility(root, true, 100);
}
