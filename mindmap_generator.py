import requests
from bs4 import BeautifulSoup
import networkx as nx
import re
import matplotlib.colors as mcolors
import matplotlib.cm as cm

excluded_headers = {
  'en': ["References", "Sources", "See also", 'Citations', 'Bibliography', "Notes", \
         "Further reading", "External links"],
  'fr': ["Références", "Sources", "Voir aussi", 'Citations', 'Bibliographie', "Notes", \
         "Articles connexes", "Liens externes", "Annexes"]
}
main_article_tags = {
  'en': ['Main article'],
  'fr': ['Article détaillé', 'Articles détaillés']
}
remove_parts = {
  'en': [r'\[edit\]', 'Edit'],
  'fr': [r'\[modifier \| modifier le code\]', 'Modifier']
}
remove_title = {
  'en': ' - Wikipedia',
  'fr': ' - Wikipédia'
}

def get_page_title(soup, language):
  title_element = soup.find("title")
  if title_element is not None:
    # The title usually ends with " - Wikipedia", so we remove it
    return title_element.text.replace(remove_title[language], "")
  else:
    return None

def extract_language_and_platform(url):
  if "wikipedia.org" in url:
    # Extracting the language code from the URL
    subdomain = url.split(".wikipedia.org")[0].split("//")[-1]
    
    # Check for mobile version
    is_mobile = ".m." in url
    if is_mobile:
      language_code = subdomain.replace(".m", "")
    else:
      language_code = subdomain.split(".")[-1]
    
    return language_code, is_mobile
  return None, None

def get_selector(language):
  base_selectors = {
    'en': lambda tag: tag.name == 'div' and tag.get('role') == 'note',
    'fr': 'div.bandeau-cell.bandeau-icone-css.loupe'  # Using CSS selector for French
  }

  base_selector = base_selectors.get(language)

  # For languages using lambda functions as selectors
  if callable(base_selector):
    def combined_selector(tag):
      return base_selector(tag) and any(article_tag in tag.get_text(strip=True) for article_tag in main_article_tags[language])
    return combined_selector

  # For languages using CSS selectors
  elif isinstance(base_selector, str):
    css_selector = base_selector
    def combined_selector(tag):
      matches_css_selector = tag.select_one(css_selector) is not None
      return matches_css_selector and any(article_tag in tag.get_text(strip=True) for article_tag in main_article_tags[language])
    return combined_selector

  else:
    return lambda tag: False

def add_node(G, name):
  global node_counter

  id = node_counter
  node_counter += 1
  G.add_node(id, name=name)

  return id

def add_edge(G, parent_id, child_name):
  child_id = add_node(G, child_name)
  G.add_edge(parent_id, child_id)
  G.nodes[child_id]['parent'] = parent_id

  return child_id

def try_add_edge(G, parent_id, child_name):
  for child_id in list(G.successors(parent_id)):
    if G.nodes[child_id]['name'] == child_name:
      return None

  return add_edge(G, parent_id, child_name)

def add_header(G, h, parent, add_edge_fun, remove_part, language):
  h_title = h.text
  h_title = re.sub(remove_part, '', h_title)
  if h_title in excluded_headers[language]:
    return None

  node_id = add_edge_fun(G, parent, h_title)

  return node_id

def generate_hierarchy(G, headers, main_article_elements, root_id, parent_name, page_level, max_depth, \
                       visited, remove_part, language):
  parent_id = None
  for h in headers:
    toclevel = int(h.name[1]) - 1
    # Determine whether the header is a h2 or h3, then generate the branch
    node_id = None
    if toclevel == 1:
      node_id = add_header(G, h, root_id, add_edge, remove_part, language)
      if node_id is not None:
        parent_id = node_id
    elif toclevel == 2:
      node_id = add_header(G, h, parent_id, try_add_edge, remove_part, language)
    if parent_name is not None and node_id is not None:
      G.nodes[node_id]['pageTitle'] = parent_name

    if node_id is None or page_level + toclevel > max_depth:
      continue

    for main_article_element in main_article_elements:
      links = main_article_element.find_all('a')
      for link in links:
        try:
          if link.get_text().split()[0] != G.nodes[node_id]['name'].split()[0]:
            continue
          if link.get('href').startswith('http'):
            url = link.get('href')
          else:
            url = f'https://{language}.wikipedia.org' + link.get('href')
        except Exception as e:
          continue

        get_page_hierarchy(url, G, node_id, page_level + toclevel, max_depth, visited)

  return G

def get_page_hierarchy(url, G, root_id, page_level=0, max_depth=4, visited=None):
  if visited is None:
    visited = set()

  if url in visited:
    return

  visited.add(url)

  try:
    response = requests.get(url)
    response.raise_for_status()
  except requests.RequestException as e:
    print(f"Failed to get {url}: {e}")
    return

  soup = BeautifulSoup(response.content, 'lxml')
  language, mobile = extract_language_and_platform(url)
  if language is None:
    return
  remove_part = remove_parts[language][mobile]

  if root_id == 0:
    title = get_page_title(soup, language)
    add_node(G, title)
  
  suffix = url.split('/')[-1]

  if page_level >= max_depth:
    return

  content_div = soup.select_one('#mw-content-text')
  if content_div is not None:
    headers = content_div.find_all_next(['h2', 'h3']) \
      if page_level + 2 <= max_depth \
      else content_div.find_all_next(['h2'])
    main_article_elements = content_div.find_all_next(get_selector(language))

    generate_hierarchy(G, headers, main_article_elements, root_id, suffix, page_level, max_depth, \
                       visited, remove_part, language)

def generate_map(url, max_depth=5):
  global node_counter
  G = nx.DiGraph()
  node_counter = 0

  get_page_hierarchy(url, G, 0, max_depth=max_depth)

  max_depth = max(1, min(nx.dag_longest_path_length(G), max_depth))
  arrange_nodes(G, [0], 0, max_depth, 1)
  set_node_colors(G)

  return G

def arrange_nodes(G, nodes_ids, depth, max_depth, scale):
  if len(nodes_ids) <= 0:
    return

  node_scale = scale * (max_depth - depth + 1)

  for node_id in nodes_ids:
    node = G.nodes[node_id]
    node['scale'] = node_scale
    node['dir'] = dir
    arrange_nodes(G, list(G.successors(node_id)), depth + 1, max_depth, scale)

def set_node_colors(G):
  distances = nx.single_source_shortest_path_length(G, 0)
  children_ids = list(G.successors(0))
  n_children = len(children_ids)
  max_distance = max(distances.values())

  for node_id in G.nodes:
    distance = distances[node_id]

    if distance == 0:  # root node
      color = "#000000"  # black
    elif node_id in children_ids:  # Direct children of the root node
      color_value = children_ids.index(node_id) / n_children
      color = cm.get_cmap("hsv")(color_value)  # hsv for more vivid, rainbow-like colors
      color = mcolors.rgb2hex(color[:3])  # convert RGB to hex, ignore alpha
    else:
      parent_id = G.nodes[node_id]['parent']
      parent_rgb = mcolors.hex2color(G.nodes[parent_id]['color'])
      white_rgb = (1, 1, 1)
      # Closer to white as the node is farther from the root
      mix_rgb = [max(0, min(c + 0.8 * (w - c) * (distance / (max_distance + 1)), 1)) for c, w in zip(parent_rgb, white_rgb)]
      color = mcolors.rgb2hex(mix_rgb)

    G.nodes[node_id]['color'] = color

def convert_url_to_mindmap(url, max_depth):
  G = generate_map(url, max_depth)

  # Convert to dict format
  nodeDataArray = []
  for node_id, attrs in G.nodes(data=True):
    node_dict = {
      'key': node_id,
      'text': attrs['name'],
      'brush': attrs['color'],
      'scale': attrs['scale'],
    }
    if node_id > 0:
      node_dict['parent'] = attrs['parent']
    if attrs.get('pageTitle') is not None:
      node_dict['pageTitle'] = attrs['pageTitle']

    nodeDataArray.append(node_dict)

  graph_dict = {
    'class': 'go.TreeModel',
    'nodeDataArray': nodeDataArray,
  }

  return graph_dict
