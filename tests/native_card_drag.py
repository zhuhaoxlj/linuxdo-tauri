"""Real WebKitGTK pointer actions, rather than synthetic HTML drop events."""
import base64
import json


def run(script, wait_for, webdriver, screenshot, directory):
    def ids(column):
        selector = '[data-column-id=' + json.dumps(column) + '] .kanban-card'
        return script('return Array.from(document.querySelectorAll(' + json.dumps(selector) + '), node => node.dataset.taskId);')

    wait_for(lambda: script('return Boolean(document.querySelector(".kanban-card, .kanban-add-button"));'), 'Board did not load')
    assert script("return !(JSON.parse(localStorage.getItem('board-data-v1') || '{}').tasks || []).length;"), 'Expected isolated empty board'
    script("""
      localStorage.setItem('board-data-v1', JSON.stringify({activeCategory:'home', tasks:[
        {id:'a',title:'First card',category:'home',column:'inbox',images:[]},
        {id:'b',title:'Second card',category:'home',column:'inbox',images:[]},
        {id:'c',title:'Third card',category:'home',column:'inbox',images:[]},
        {id:'d',title:'Doing card',category:'home',column:'doing',images:[]}
      ],notes:[],schedules:[],dayGoals:[]}));
      location.reload();
    """)
    wait_for(lambda: ids('inbox') == ['a', 'b', 'c'], 'Fixture did not load')

    def drag(source, destination, fraction=0.5):
        def point(selector, fraction):
            return script('const r=document.querySelector(' + json.dumps(selector) + ').getBoundingClientRect();'
                          'return {x:Math.round(r.left+20),y:Math.round(r.top+r.height*' + str(fraction) + ')};')
        start = point(source, 0.5)
        end = point(destination, fraction)
        actions = [{'type':'pointerMove', 'origin':'viewport', **start}, {'type':'pointerDown', 'button':0}]
        for step in range(1, 9):
            actions.extend([{'type':'pointerMove', 'origin':'viewport', 'duration':80,
                             'x':round(start['x']+(end['x']-start['x'])*step/8),
                             'y':round(start['y']+(end['y']-start['y'])*step/8)},
                            {'type':'pause', 'duration':50}])
        actions.append({'type':'pointerUp', 'button':0})
        webdriver('POST', '/actions', {'actions':[{'type':'pointer','id':'card-mouse','parameters':{'pointerType':'mouse'},'actions':actions}]})

    drag('[data-task-id="a"]', '[data-task-id="d"]', 0.25)
    try:
        wait_for(lambda: ids('doing') == ['a', 'd'], 'Cross-column pointer dragging failed', timeout=5)
        drag('[data-task-id="a"]', '[data-task-id="d"]', 0.75)
        wait_for(lambda: ids('doing') == ['d', 'a'], 'Downward sorting failed')
        drag('[data-task-id="a"]', '[data-task-id="d"]', 0.25)
        wait_for(lambda: ids('doing') == ['a', 'd'], 'Upward sorting failed')
        drag('[data-task-id="a"]', '[data-column-id="todo"] .kanban-add-button')
        wait_for(lambda: ids('todo') == ['a'], 'Empty-column dragging failed')
        script('location.reload();')
        wait_for(lambda: ids('todo') == ['a'] and ids('doing') == ['d'], 'Order did not survive reload')
        print('PASS: real native pointer dragging supports cross-column moves, both sort directions, empty columns and reload')
    finally:
        (directory / 'drag.png').write_bytes(base64.b64decode(screenshot()))
