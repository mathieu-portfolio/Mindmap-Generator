##
# @file flask_app.py
# @brief Flask API for the Mind Map Generator.
# 
# @details
# This application provides endpoints for generating, saving, retrieving, and deleting mind maps
# based on Wikipedia articles. The frontend uses GoJS to visualize the mind maps.


import os
from flask import Flask, request, render_template, jsonify, send_from_directory
from mindmap_generator import convert_url_to_mindmap

app = Flask(__name__)

base_dir = os.path.abspath(os.path.dirname(__file__))
json_dir = os.path.join(base_dir, 'json_mmaps')

##
# @brief Generates a mind map from a given Wikipedia URL.
#
# @return {flask.Response}: JSON response containing the generated mind map.
@app.route('/generate', methods=['POST'])
def generate():
  """
  Example:
    Request:
    {
      "url": "https://en.wikipedia.org/wiki/Mind_map",
      "max_depth": 3
    }

    Response:
    {
      "class": "go.TreeModel",
      "nodeDataArray": [...]
    }
  """
  data = request.json
  url = data['url']
  max_depth = int(data['max_depth'])
  
  mindmap = convert_url_to_mindmap(url, max_depth)
  
  return jsonify(mindmap)

##
# @brief Saves a generated mind map to a JSON file.
#
# @return {flask.Response}: JSON response indicating success or failure.
@app.route('/save', methods=['POST'])
def save():
  """
  Example:
    Request:
    {
      "modelData": "{...}",
      "filename": "my_mindmap"
    }

    Response: { "success": true }
  """
  data = request.get_json()
  modelData = data['modelData']
  filename = data['filename']

  # Save the modelData to your file in 'json_mmaps'
  with open(os.path.join(json_dir, f'{filename}.json'), 'w') as f:
    f.write(modelData)

  return jsonify({'success': True})

##
# @brief Deletes a saved mind map JSON file.
#
# @param {str} filename: The name of the file to delete.
#
# @return {flask.Response}: JSON response indicating success or failure.
@app.route('/delete/<filename>', methods=['POST'])
def delete_file(filename):
  """
  Example:
    Request: POST /delete/my_mindmap

    Response: { "success": true }
  """
  try:
    os.remove(os.path.join(json_dir, f'{filename}.json'))
    return jsonify({'success': True})
  except Exception as e:
    return jsonify({'success': False, 'error': str(e)})

##
# @brief Retrieves a saved mind map JSON file.
#
# @param {str} filename: The name of the mind map file (without extension).
#
# @return {flask.Response}: The requested JSON file as a download.
@app.route('/get_mindmap/<filename>', methods=['GET'])
def get_mindmap(filename):
  """
  Example:
    Request: GET /get_mindmap/my_mindmap

    Response: { "class": "go.TreeModel", "nodeDataArray": [...] }
  """
  return send_from_directory(json_dir, f'{filename}.json')

##
# @brief Lists all saved mind map files.
#
# @return {flask.Response}: JSON list of filenames (without extensions).
@app.route('/get_json_files', methods=['GET'])
def get_json_files():
  """
  Example:
    Request: GET /get_json_files

    Response: ["mindmap1", "mindmap2"]
  """
  json_files = [f.split('.')[0] for f in os.listdir(json_dir) if f.endswith('.json')]
  print("JSON Directory: ", json_dir)
  print("Files in JSON Directory: ", json_files)
  return jsonify(json_files)

##
# @brief Serves the homepage.
#
# @return {flask.Response}: The `index.html` template.
@app.route('/')
def home():
  return render_template('index.html')

if __name__ == '__main__':
  app.run(port=5000, debug=True)
