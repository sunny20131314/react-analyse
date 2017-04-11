/**
 * Created by sunzhimin on 2017/4/10.
 * 简要分析 react 源代码思路
 */

//component类，用来表示文本在渲染，更新，删除时应该做些什么事情, 这边暂时只用到渲染，另外两个可以先忽略
function ReactDOMTextComponent(text) {
  //存下当前的字符串
  this._currentElement = '' + text;
  //用来标识当前component
  this._rootNodeID = null;
}

//component渲染时生成的dom结构
ReactDOMTextComponent.prototype.mountComponent = function(rootID) {
  this._rootNodeID = rootID;
  return '<span data-reactid="' + rootID + '">' + this._currentElement + '</span>';
};

// 如果不同的话，直接找到对应的节点，更新就好了。
ReactDOMTextComponent.prototype.receiveComponent = function(nextText) {
  var nextStringText = '' + nextText;
  //跟以前保存的字符串比较
  if (nextStringText !== this._currentElement) {
    this._currentElement = nextStringText;
    //替换整个节点
    $('[data-reactid="' + this._rootNodeID + '"]').html(this._currentElement);

  }
};


// ReactDOMComponent。这样我们就实现了渲染浏览器基本元素的功能了。
//component类，用来表示DOM在渲染，更新，删除时应该做些什么事情
function ReactDOMComponent(element){
  //存下当前的element对象引用
  this._currentElement = element;
  this._rootNodeID = null;
}

//component渲染时生成的dom结构
ReactDOMComponent.prototype.mountComponent = function(rootID){
  //赋值标识
  this._rootNodeID = rootID;
  var props = this._currentElement.props;
  var tagOpen = '<' + this._currentElement.type;
  var tagClose = '</' + this._currentElement.type + '>';

  //加上reactid标识
  tagOpen += ' data-reactid=' + this._rootNodeID;

  //拼凑出属性
  for (var propKey in props) {

    //这里要做一下事件的监听，就是从属性props里面解析拿出on开头的事件属性的对应事件监听
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      //针对当前的节点添加事件代理,以_rootNodeID为命名空间
      $(document).delegate('[data-reactid="' + this._rootNodeID + '"]', eventType + '.' + this._rootNodeID, props[propKey]);
    }

    //对于children属性以及事件监听的属性不需要进行字符串拼接
    //事件会代理到全局。这边不能拼到dom上不然会产生原生的事件监听
    if (props[propKey] && propKey != 'children' && !/^on[A-Za-z]/.test(propKey)) {
      tagOpen += ' ' + propKey + '=' + props[propKey];
    }
  }
  //获取子节点渲染出的内容
  var content = '';
  var children = props.children || [];

  var childrenInstances = []; //用于保存所有的子节点的componet实例，以后会用到
  var that = this;
  $.each(children, function(key, child) {
    //这里再次调用了instantiateReactComponent实例化子节点component类，拼接好返回
    var childComponentInstance = instantiateReactComponent(child);
    childComponentInstance._mountIndex = key;

    childrenInstances.push(childComponentInstance);
    //子节点的rootId是父节点的rootId加上新的key也就是顺序的值拼成的新值
    var curRootId = that._rootNodeID + '.' + key;
    //得到子节点的渲染内容
    var childMarkup = childComponentInstance.mountComponent(curRootId);
    //拼接在一起
    content += ' ' + childMarkup;

  });

  //留给以后更新时用的这边先不用管
  this._renderedChildren = childrenInstances;

  //拼出整个html内容
  return tagOpen + '>' + content + tagClose;
}

// 想一下我们怎么以最小代价去更新这段html呢。不难发现其实主要包括两个部分：
//    属性的更新，包括对特殊属性比如事件的处理
//    子节点的更新,这个比较复杂，为了得到最好的效率，我们需要处理下面这些问题：
//         拿新的子节点树跟以前老的子节点树对比，找出他们之间的差别。我们称之为 diff
//         所有差别找出后，再一次性的去更新。我们称之为 patch
ReactDOMComponent.prototype.receiveComponent = function(nextElement) {
  var lastProps = this._currentElement.props;
  var nextProps = nextElement.props;

  this._currentElement = nextElement;
  //需要单独的更新属性
  this._updateDOMProperties(lastProps, nextProps);
  //再更新子节点
  this._updateDOMChildren(nextElement.props.children);
};

//全局的更新深度标识
var updateDepth = 0;
//全局的更新队列，所有的差异都存在这里
var diffQueue = [];

// 更新子节点包含两个部分，一个是递归的分析差异，把差异添加到队列中。然后在合适的时机调用_patch把差异应用到dom上。
ReactDOMComponent.prototype._updateDOMChildren = function(nextChildrenElements){
  updateDepth++;
  //_diff用来递归找出差别,组装差异对象,添加到更新队列diffQueue。
  this._diff(diffQueue, nextChildrenElements);
  updateDepth--;
  if(updateDepth == 0){
    //在需要的时候调用patch，执行具体的dom操作
    this._patch(diffQueue);
    diffQueue = [];
  }
};



//差异更新的几种类型: 移动， 卸载， 添加
var UPDATE_TYPES = {
  MOVE_EXISTING: 1,
  REMOVE_NODE: 2,
  INSERT_MARKUP: 3
};

// 普通的children是一个数组，此方法把它转换成一个map,key就是element的key,
//   如果是text节点或者element创建时并没有传入key,就直接用在数组里的index标识

// 这里的flattenChildren需要给予很大的关注，比如对于一个表格列表，我们在最前面插入了一条数据，
// 想一下如果我们创建element时没有传入key，所有的key都是null,
// 这样reactjs在generateComponentChildren时就会默认通过顺序（index）来一一对应改变前跟改变后的子节点，
// 这样变更前与变更后的对应节点判断（_shouldUpdateReactComponent）其实是不合适的。
//   也就是说对于这种列表的情况，我们最好给予唯一的标识key，这样reactjs找对应关系时会更方便一点。
function flattenChildren(componentChildren) {
  var child;
  var name;
  var childrenMap = {};
  for (var i = 0; i < componentChildren.length; i++) {
    child = componentChildren[i];
    name = child && child._currentelement && child._currentelement.key ? child._currentelement.key : i.toString(36);
    childrenMap[name] = child;
  }
  return childrenMap;
}


//主要用来生成子节点elements的component集合
// generateComponentChildren 会尽量的复用以前的component，也就是那些坑，
//   当发现可以复用component（也就是key一致）时，
//     就还用以前的，只需要调用他对应的更新方法receiveComponent就行了，这样就会递归的去获取子节点的差异对象然后放到队列了。
//   如果发现不能复用那就是新的节点，我们就需要instantiateReactComponent重新生成一个新的component。
function generateComponentChildren(prevChildren, nextChildrenElements) {
  var nextChildren = {};
  nextChildrenElements = nextChildrenElements || [];
  $.each(nextChildrenElements, function(index, element) {
    var name = element.key ? element.key : index;
    var prevChild = prevChildren && prevChildren[name];
    var prevElement = prevChild && prevChild._currentElement;
    var nextElement = element;

    //调用_shouldUpdateReactComponent判断是否是更新
    if (_shouldUpdateReactComponent(prevElement, nextElement)) {
      //更新的话直接递归调用子节点的receiveComponent就好了
      prevChild.receiveComponent(nextElement);
      //然后继续使用老的component
      nextChildren[name] = prevChild;
    } else {
      //对于没有老的，那就重新新增一个，重新生成一个component
      var nextChildInstance = instantiateReactComponent(nextElement, null);
      //使用新的component
      nextChildren[name] = nextChildInstance;
    }
  })

  return nextChildren;
}



//_diff用来递归找出差别,组装差异对象,添加到更新队列diffQueue。
// 注意： _diff内部也会递归调用子节点的receiveComponent于是当某个子节点也是浏览器普通节点，就也会走_updateDOMChildren这一步。
// 所以这里使用了updateDepth来记录递归的过程，只有等递归回来updateDepth为0时，代表整个差异已经分析完毕，可以开始使用patch来处理差异队列了。
ReactDOMComponent.prototype._diff = function(diffQueue, nextChildrenElements) {
  var self = this;

  //拿到之前的子节点的 component类型对象的集合,这个是在刚开始渲染时赋值的，记不得的可以翻上面
  //_renderedChildren 本来是数组，我们搞成map
  var prevChildren = flattenChildren(self._renderedChildren);

  //生成新的子节点的component对象集合，这里注意，会复用老的component对象
  var nextChildren = generateComponentChildren(prevChildren, nextChildrenElements);

  //重新赋值_renderedChildren，使用最新的。
  self._renderedChildren = [];
  $.each(nextChildren, function(key, instance) {
    self._renderedChildren.push(instance);
  });


  var nextIndex = 0; //代表到达的新的节点的index
  //通过对比两个集合的差异，组装差异节点添加到队列中
  for (var name in nextChildren) {
    if (!nextChildren.hasOwnProperty(name)) {
      continue;
    }
    var prevChild = prevChildren && prevChildren[name];
    var nextChild = nextChildren[name];
    //相同的话，说明是使用的同一个component,所以我们需要做移动的操作
    if (prevChild === nextChild) {
      //添加差异对象，类型：MOVE_EXISTING
      diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
        type: UPDATE_TYPES.MOVE_EXISTING,
        fromIndex: prevChild._mountIndex,
        toIndex: nextIndex
      })
    } else { //如果不相同，说明是新增加的节点
      //但是如果老的还存在，就是element不同，但是component一样。我们需要把它对应的老的element删除。
      if (prevChild) {
        //添加差异对象，类型：REMOVE_NODE
        diffQueue.push({
          parentId: self._rootNodeID,
          parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
          type: UPDATE_TYPES.REMOVE_NODE,
          fromIndex: prevChild._mountIndex,
          toIndex: null
        });

        //如果以前已经渲染过了，记得先去掉以前所有的事件监听，通过命名空间全部清空
        if (prevChild._rootNodeID) {
          $(document).undelegate('.' + prevChild._rootNodeID);
        }

      }
      //新增加的节点，也组装差异对象放到队列里
      //添加差异对象，类型：INSERT_MARKUP
      diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
        type: UPDATE_TYPES.INSERT_MARKUP,
        fromIndex: null,
        toIndex: nextIndex,
        markup: nextChild.mountComponent() //新增的节点，多一个此属性，表示新节点的dom内容
      })
    }
    //更新mount的index
    nextChild._mountIndex = nextIndex;
    nextIndex++;
  }



  //对于老的节点里有，新的节点里没有的那些，也全都删除掉
  for (name in prevChildren) {
    if (prevChildren.hasOwnProperty(name) && !(nextChildren && nextChildren.hasOwnProperty(name))) {
      //添加差异对象，类型：REMOVE_NODE
      diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid=' + self._rootNodeID + ']'),
        type: UPDATE_TYPES.REMOVE_NODE,
        fromIndex: prevChild._mountIndex,
        toIndex: null
      })
      //如果以前已经渲染过了，记得先去掉以前所有的事件监听
      if (prevChildren[name]._rootNodeID) {
        $(document).undelegate('.' + prevChildren[name]._rootNodeID);
      }
    }
  }
};

// 属性的变更并不是特别复杂，主要就是找到以前老的不用的属性直接去掉，新的属性赋值，并且注意其中特殊的事件属性做出特殊处理就行了。
ReactDOMComponent.prototype._updateDOMProperties = function(lastProps, nextProps) {
  var propKey;

  //遍历，当一个老的属性不在新的属性集合里时，需要删除掉。
  for (propKey in lastProps) {
    //新的属性里有，或者propKey是在原型上的直接跳过。这样剩下的都是不在新属性集合里的。需要删除
    if (nextProps.hasOwnProperty(propKey) || !lastProps.hasOwnProperty(propKey)) {
      continue;
    }
    //对于那种特殊的，比如这里的事件监听的属性我们需要去掉监听
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      //针对当前的节点取消事件代理
      $(document).undelegate('[data-reactid="' + this._rootNodeID + '"]', eventType, lastProps[propKey]);
      continue;
    }

    //从dom上删除不需要的属性
    $('[data-reactid="' + this._rootNodeID + '"]').removeAttr(propKey)
  }

  //对于新的属性，需要写到dom节点上
  for (propKey in nextProps) {
    //对于事件监听的属性我们需要特殊处理
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      //以前如果已经有，说明有了监听，需要先去掉
      lastProps[propKey] && $(document).undelegate('[data-reactid="' + this._rootNodeID + '"]', eventType, lastProps[propKey]);
      //针对当前的节点添加事件代理,以_rootNodeID为命名空间
      $(document).delegate('[data-reactid="' + this._rootNodeID + '"]', eventType + '.' + this._rootNodeID, nextProps[propKey]);
      continue;
    }

    if (propKey == 'children') continue;

    //添加新的属性，或者是更新老的同名属性
    $('[data-reactid="' + this._rootNodeID + '"]').prop(propKey, nextProps[propKey])
  }

};

//用于将childNode插入到指定位置
function insertChildAt(parentNode, childNode, index) {
  var beforeChild = parentNode.children().get(index);
  beforeChild ? childNode.insertBefore(beforeChild) : childNode.appendTo(parentNode);
}

// 主要就是挨个遍历差异队列，遍历两次，第一次删除掉所有需要变动的节点，然后第二次插入新的节点还有修改的节点。
// 这里为什么可以直接挨个的插入呢？
// 原因就是我们在diff阶段添加差异节点到差异队列时，本身就是有序的，
// 也就是说对于新增节点（包括move和insert的）在队列里的顺序就是最终dom的顺序，所以我们才可以挨个的直接根据index去塞入节点。
ReactDOMComponent.prototype._patch = function(updates) {
  var update;
  var initialChildren = {};
  var deleteChildren = [];
  for (var i = 0; i < updates.length; i++) {
    update = updates[i];
    if (update.type === UPDATE_TYPES.MOVE_EXISTING || update.type === UPDATE_TYPES.REMOVE_NODE) {
      var updatedIndex = update.fromIndex;
      var updatedChild = $(update.parentNode.children().get(updatedIndex));
      var parentID = update.parentID;

      //所有需要更新的节点都保存下来，方便后面使用
      initialChildren[parentID] = initialChildren[parentID] || [];
      //使用parentID作为简易命名空间
      initialChildren[parentID][updatedIndex] = updatedChild;


      //所有需要修改的节点先删除,对于move的，后面再重新插入到正确的位置即可
      deleteChildren.push(updatedChild)
    }

  }

  //删除所有需要先删除的
  $.each(deleteChildren, function(index, child) {
    $(child).remove();
  });


  //再遍历一次，这次处理新增的节点，还有修改的节点这里也要重新插入
  for (var k = 0; k < updates.length; k++) {
    update = updates[k];
    switch (update.type) {
      case UPDATE_TYPES.INSERT_MARKUP:
        insertChildAt(update.parentNode, $(update.markup), update.toIndex);
        break;
      case UPDATE_TYPES.MOVE_EXISTING:
        insertChildAt(update.parentNode, initialChildren[update.parentID][update.fromIndex], update.toIndex);
        break;
      case UPDATE_TYPES.REMOVE_NODE:
        // 什么都不需要做，因为上面已经帮忙删除掉了
        break;
    }
  }
};

//定义ReactClass类,所有自定义的超级父类: createClass
var ReactClass = function(){
};
//留给子类去继承覆盖
ReactClass.prototype.render = function(){};
//setState
ReactClass.prototype.setState = function(newState) {

  //还记得我们在ReactCompositeComponent里面mount的时候 做了赋值
  //所以这里可以拿到 对应的ReactCompositeComponent的实例_reactInternalInstance
  this._reactInternalInstance.receiveComponent(null, newState);
};


function ReactCompositeComponent(element){
  //存放元素element对象
  this._currentElement = element;
  //存放唯一标识
  this._rootNodeID = null;
  //存放对应的ReactClass的实例
  this._instance = null;
}

//用于返回当前自定义元素渲染时应该返回的内容
// 实现并不难，ReactClass的render一定是返回一个虚拟节点(包括element和text)，
// 这个时候我们使用 instantiateReactComponent 去得到实例，再使用 mountComponent 拿到结果作为当前自定义元素的结果。
// -> render() 返回虚拟节点 -> instantiateReactComponent() 实例化 -> mountComponent 当前自定义元素结果

// 需要注意的是自定义元素并不会处理我们createElement时传入的子节点，它只会处理自己render返回的节点作为自己的子节点。
// 不过我们在render时可以使用this.props.children拿到那些传入的子节点，可以自己处理。
// 其实有点类似webcomponents里面的shadow dom的作用。
ReactCompositeComponent.prototype.mountComponent = function(rootID){
  this._rootNodeID = rootID;

  //拿到当前元素对应的属性值
  var publicProps = this._currentElement.props;

  //拿到对应的ReactClass type 为 HelloMessage constructor
  var ReactClass = this._currentElement.type;

  // Initialize the public class
  var inst = new ReactClass(publicProps); // publicProps: {name: "John"}

  this._instance = inst;
  //保留对当前comonent的引用，下面更新会用到
  inst._reactInternalInstance = this;

  if (inst.componentWillMount) {
    inst.componentWillMount();
    //这里在原始的reactjs其实还有一层处理，就是  componentWillMount调用setstate，不会触发render而是自动提前合并，这里为了保持简单，就略去了
  }

  //调用ReactClass的实例的render方法,返回一个element或者一个文本节点
  var renderedElement = this._instance.render(); // renderedElement = ReactElement {type: "div", key: null, props: Object}

  //得到renderedElement对应的component类实例
  var renderedComponentInstance = instantiateReactComponent(renderedElement); // renderedComponentInstance = ReactDOMComponent {_currentElement: ReactElement, _rootNodeID: 0, _renderedChildren: Array(3)}
  this._renderedComponent = renderedComponentInstance; //存起来留作后用

  //拿到渲染之后的字符串内容，将当前的_rootNodeID传给render出的节点
  var renderedMarkup = renderedComponentInstance.mountComponent(this._rootNodeID);

  //之前我们在React.render方法最后触发了mountReady事件，所以这里可以监听，在渲染完成后会触发。
  $(document).on('mountReady', function() {
    //调用inst.componentDidMount
    inst.componentDidMount && inst.componentDidMount();
  });

  return renderedMarkup;
};

//更新
ReactCompositeComponent.prototype.receiveComponent = function(nextElement, newState) {

  //如果接受了新的，就使用最新的element
  this._currentElement = nextElement || this._currentElement;

  var inst = this._instance;

  //合并state
  var nextState = $.extend(inst.state, newState);
  var nextProps = this._currentElement.props;


  //改写state
  inst.state = nextState;


  //如果inst有shouldComponentUpdate并且返回false。说明组件本身判断不要更新，就直接返回。
  if (inst.shouldComponentUpdate && (inst.shouldComponentUpdate(nextProps, nextState) === false)) return;

  //生命周期管理，如果有componentWillUpdate，就调用，表示开始要更新了。
  if (inst.componentWillUpdate) inst.componentWillUpdate(nextProps, nextState);


  var prevComponentInstance = this._renderedComponent;
  var prevRenderedElement = prevComponentInstance._currentElement;

  //重新执行render拿到对应的新element;
  var nextRenderedElement = this._instance.render();


  //判断是需要更新还是直接就重新渲染
  //注意这里的_shouldUpdateReactComponent跟上面的不同哦 这个是全局的方法
  if (_shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
    //如果需要更新，就继续调用子节点的receiveComponent的方法，传入新的element更新子节点。
    prevComponentInstance.receiveComponent(nextRenderedElement);
    //调用componentDidUpdate表示更新完成了
    inst.componentDidUpdate && inst.componentDidUpdate();

  } else {
    //如果发现完全是不同的两种element，那就干脆重新渲染了
    var thisID = this._rootNodeID;

    //重新new一个对应的component，
    this._renderedComponent = this._instantiateReactComponent(nextRenderedElement);

    //重新生成对应的元素内容
    var nextMarkup = _renderedComponent.mountComponent(thisID);

    //替换整个节点
    $('[data-reactid="' + this._rootNodeID + '"]').replaceWith(nextMarkup);

  }

};

//用来判定两个element需不需要更新
//这里的key是我们createElement的时候可以选择性的传入的。用来标识这个element，当发现key不同时，我们就可以直接重新渲染，不需要去更新了。
var _shouldUpdateReactComponent = function(prevElement, nextElement){
  if (prevElement != null && nextElement != null) {
    var prevType = typeof prevElement;
    var nextType = typeof nextElement;
    if (prevType === 'string' || prevType === 'number') {
      return nextType === 'string' || nextType === 'number';
    } else {
      return nextType === 'object' && prevElement.type === nextElement.type && prevElement.key === nextElement.key;
    }
  }
  return false;
}




//component工厂  用来返回一个component实例
// instantiateReactComponent用来根据element的类型（现在只有一种string类型），返回一个component的实例。其实就是个类工厂。
function instantiateReactComponent(node){
  //文本节点的情况
  if(typeof node === 'string' || typeof node === 'number'){
    return new ReactDOMTextComponent(node);
  }
  //浏览器默认节点的情况
  if(typeof node === 'object' && typeof node.type === 'string'){
    //注意这里，使用了一种新的component
    return new ReactDOMComponent(node);
  }
  //自定义的元素节点
  if(typeof node === 'object' && typeof node.type === 'function'){
    //注意这里，使用新的component,专门针对自定义元素
    return new ReactCompositeComponent(node);
  }
}


//ReactElement就是虚拟dom的概念，具有一个type属性代表当前的节点类型，还有节点的属性props
//比如对于div这样的节点type就是div，props就是那些attributes
//另外这里的key,可以用来标识这个element，用于优化以后的更新，这里可以先不管，知道有这么个东西就好了
function ReactElement(type,key,props){
  this.type = type;
  this.key = key;
  this.props = props;
}

// 可以看到我们把逻辑分为几个部分，主要的渲染逻辑放在了具体的componet类去定义。
// React.render负责调度整个流程，这里是调用instantiateReactComponent生成一个对应component类型的实例对象，
// 然后调用此对象的mountComponent获取生成的内容。最后写到对应的container节点中。
React = {
  nextReactRootIndex:0,  // nextReactRootIndex 作为每个component的标识id，不断加1，确保唯一性。这样我们以后可以通过这个标识找到这个元素。
  createClass: function(spec){
    //生成一个子类
    var Constructor = function (props) {
      this.props = props;
      this.state = this.getInitialState ? this.getInitialState() : null;
    };

    //原型继承，继承超级父类 todo： 并没有继承父类， why？

    Constructor.prototype = new ReactClass();
    Constructor.prototype.constructor = Constructor;

    //混入spec到原型
    $.extend(Constructor.prototype, spec);
    return Constructor;
  },
  createElement:function(type,config,children){
    var props = {},propName;
    config = config || {};
    //看有没有key，用来标识element的类型，方便以后高效的更新，这里可以先不管
    var key = config.key || null;

    //复制config里的内容到props
    for (propName in config) {
      if (config.hasOwnProperty(propName) && propName !== 'key') {
        props[propName] = config[propName];
      }
    }

    //处理children,全部挂载到props的children属性上
    //支持两种写法，如果只有一个参数，直接赋值给children，否则做合并处理
    console.log( arguments,  'arguments');
    var childrenLength = arguments.length - 2;
    if (childrenLength === 1) {
      props.children = $.isArray(children) ? children : [children] ;
    } else if (childrenLength > 1) {
      var childArray = Array(childrenLength);
      for (var i = 0; i < childrenLength; i++) {
        childArray[i] = arguments[i + 2];
      }
      props.children = childArray;
    }

    return new ReactElement(type, key, props);

  },
  render:function(element,container){
    var componentInstance = instantiateReactComponent(element);
    var markup = componentInstance.mountComponent(React.nextReactRootIndex++);
    console.log( markup,  'markup');
    $(container).html(markup);
    //触发完成mount的事件
    $(document).trigger('mountReady');
  }
};

      // React_type4:  setState
var HelloMessage = React.createClass({
  getInitialState: function() {
    return {type: 'say:'};
  },
  changeType: function(){
    this.setState({type:'shout:'})
  },
  render: function() {
    return React.createElement("div", {onclick: this.changeType.bind(this)}, this.state.type, "Hello ", this.props.name);
  }
});


React.render(React.createElement(HelloMessage, {name: "John"}), document.getElementById("container"));



//       React_type3： 使用自定义元素
//    reactjs通过虚拟dom做到了类似的功能，还记得我们上面element.type只是个简单的字符串，如果是个类呢？如果这个类恰好还有自己的生命周期管理，那扩展性就很高了。
//    传一个对象给React.createClass 生成实例： HelloMessage
//    var HelloMessage = React.createClass({
//      getInitialState: function() {
//        return {type: 'say:'};
//      },
//      componentWillMount: function() {
//        console.log('我就要开始渲染了。。。')
//      },
//      componentDidMount: function() {
//        console.log('我已经渲染好了。。。')
//      },
//      render: function() {
//        return React.createElement("div", null, this.state.type, "Hello ", this.props.name);
//      }
//    });
//
//
//    React.render(React.createElement(HelloMessage, {name: "John~~~"}), document.getElementById("container"));


//      React_type2： 演示事件监听怎么用
//    function hello(){
//      alert('hello')
//    }
//
//    var element = React.createElement('div',{id:'test',onclick:hello},'click me')
//
//    React.render(element,document.getElementById("container"))


//      React_type1: 简单渲染 hello,world!
//    React.render('hello world',document.getElementById("container"))