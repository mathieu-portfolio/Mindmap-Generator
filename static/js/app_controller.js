// Define global variables
window.currentDiagram = 0;
window.diagrams = [];
window.expandNumber = 1;

/**
 * @file app_controller.js
 * @brief Controls application logic.
 * @module AppController
 */

/**
 * Initializes the entire application, including both the graph and mindmap.
 */
function init() {
  initGraph();
  initMindmap();
  load();
  updateFileList();
}

/**
 * Generates the mindmap from the given URL and depth parameters.
 */
function generate() {
  diagram = diagrams[currentDiagram];
  diagram.startTransaction("Generate");
  var url = document.getElementById("urlInput").value;
  var maxDepth = document.getElementById("depthInput").value;

  // Show the AppController
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

/**
 * Retrieves the Wikipedia page title from a given node.
 * @param {go.Node} node - The selected node.
 * @returns {string|null} - The extracted page title or null if not found.
 */
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

/**
 * Sets the number of expansion levels for node children.
 * @param {number} value - The expansion depth.
 */
function setExpandNumber(value) {
  expandNumber = value;
}

/**
 * Toggles fullscreen mode for the diagram view.
 */
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

/**
 * Updates input fields' states based on user interaction.
 */
function updateInputs() {
  var urlInput = document.getElementById("urlInput");
  var depthInput = document.getElementById("depthInput");
  var generateButton = document.getElementById("GenerateButton");

  generateButton.disabled = !urlInput.value || !depthInput.value;
}

/**
 * Saves the current mindmap to a file.
 */
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

/**
 * Loads a mindmap from the text input field.
 */
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

/**
 * Loads a mindmap from a saved file.
 */
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

/**
 * Deletes a saved mindmap file.
 * @param {string} filename - Name of the file to delete.
 */
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

/**
 * Displays the diagram corresponding to the given index.
 * @param {number} idx - Index of the diagram to display.
 */
function displayDiagram(idx) {
  var diagram;
  for (diagram of diagrams) diagram.div.style.display = "none";
  diagrams[idx].div.style.display = "block";
}

/**
 * Updates the file list of saved mindmaps.
 */
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

window.onload = function () {
  // Hide the AppController
  document.getElementById("loader").style.display = "none";
  updateInputs();
};


window.addEventListener("DOMContentLoaded", init);
