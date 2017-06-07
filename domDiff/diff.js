/**
 * Created by sunzhimin on 2017/6/7.
 */

function createComponent(name) {
  class _MyNode extends React.Component{
    constructor(props) {
      super(props);
      console.log(name + ' did created.');
    }
    componentDidMount() {
      console.log(name + ' did mount.');
    }

    componentWillUnmount() {
      console.log(name + ' will unmount.');
    }

    componentDidUpdate() {
      console.log(name + ' did updated.');
    }

    render() {
      return (
        <div className={'node ' + name} data-name={name}>
          {this.props.children}
        </div>
      );
    }
  }
  return _MyNode;
}

var Root = createComponent('R');
var A = createComponent('A');
var B = createComponent('B');
var C = createComponent('C');
var D = createComponent('D');

var Wrapper = React.createClass({
  propTypes: {
    shape: React.PropTypes.string.isRequired
  },

  shape1: function() {
    return (
      <Root>
        <A>
          <B />
          <C />
        </A>
        <D />
      </Root>
    );
  },

  shape2: function() {
    return (
      <Root>
        <A>
          <B />
        </A>
        <D>
          <C />
        </D>
      </Root>
    );
  },

  shape3: function() {
    return (
      <Root>
        <A>
          <B>
            <C />
          </B>
        </A>
        <D />
      </Root>
    );
  },

  shape4: function() {
    return (
      <Root>
        <A>
          <B />
          <D>
            <C />
          </D>
        </A>
      </Root>
    );
  },

  shape5: function() {
    return (
      <Root>
        <A>
          <B key="B" />
          <C key="C" />
        </A>
        <D />
      </Root>
    );
  },

  shape6: function() {
    return (
      <Root>
        <A>
          <C key="C" />
          <B key="B" />
        </A>
        <D />
      </Root>
    );
  },

  render: function() {
    if (this[this.props.shape]) {
      return this[this.props.shape]();
    } else {
      return <Root />;
    }
  }
});

ReactDOM.render(<Wrapper shape='shape1'/>,  document.getElementById('shape1'));
ReactDOM.render(<Wrapper shape='shape2'/>,  document.getElementById('shape2'));
ReactDOM.render(<Wrapper shape='shape3'/>,  document.getElementById('shape3'));
ReactDOM.render(<Wrapper shape='shape4'/>,  document.getElementById('shape4'));
ReactDOM.render(<Wrapper shape='shape5'/>,  document.getElementById('shape5'));
ReactDOM.render(<Wrapper shape='shape6'/>,  document.getElementById('shape6'));

window.render = function render(shape) {
  ReactDOM.render(<Wrapper shape={shape}/>,  document.getElementById('react-root'), function() {console.log('=====================');});
};